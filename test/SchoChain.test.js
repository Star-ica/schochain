const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const E = ethers.parseEther;
const U = (n) => BigInt(n) * 10n ** 6n;
const H = (s) => ethers.id(s);
const DAY = 86400;
const Status = { None: 0, Submitted: 1, InReview: 2, Approved: 3, Rejected: 4, Claimed: 5, Withdrawn: 6, Expired: 7, Cancelled: 8 };
const State = { Active: 0, Closed: 1, Cancelled: 2 };

async function deployAll() {
  const [admin, provider, s1, s2, s3, r1, r2, r3, rando] = await ethers.getSigners();
  const registry = await (await ethers.getContractFactory("ProviderRegistry")).deploy();
  const appReg = await (await ethers.getContractFactory("ApplicationRegistry")).deploy();
  const impl = await (await ethers.getContractFactory("ScholarshipProgram")).deploy();
  const usdt = await (await ethers.getContractFactory("MockUSDT")).deploy();
  const factory = await (await ethers.getContractFactory("ScholarshipFactory")).deploy(
    await registry.getAddress(), await appReg.getAddress(), await impl.getAddress(), await usdt.getAddress());
  await appReg.setFactory(await factory.getAddress());
  await registry.connect(provider).register("Hope Foundation", "https://hope.example");
  await registry.verify(provider.address);
  return { admin, provider, s1, s2, s3, r1, r2, r3, rando, registry, appReg, impl, usdt, factory };
}

async function params(over = {}) {
  const now = await time.latest();
  return {
    title: "STEM Excellence Grant", summary: "For STEM undergraduates", infoURI: "https://hope.example/stem",
    criteria: ["Enrolled in a university", "Studies a STEM field", "Financial need"],
    requiredMask: 3n, currency: 0, awardAmount: E("1"), maxAwards: 2, deadline: now + 30 * DAY,
    requiredReviews: 2, claimWindowDays: 30, ...over,
  };
}

async function newProgram(ctx, over = {}) {
  const p = await params(over);
  const tx = await ctx.factory.connect(ctx.provider).createProgram(p);
  const rc = await tx.wait();
  const ev = rc.logs.map((l) => { try { return ctx.factory.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "ProgramCreated");
  return ethers.getContractAt("ScholarshipProgram", ev.args.program);
}

// program with 2 reviewers, 3 applicants, funded with 5 BOT
async function seeded() {
  const ctx = await deployAll();
  const prog = await newProgram(ctx);
  await prog.connect(ctx.provider).fund({ value: E("5") });
  await prog.connect(ctx.provider).addReviewer(ctx.r1.address);
  await prog.connect(ctx.provider).addReviewer(ctx.r2.address);
  for (const s of [ctx.s1, ctx.s2, ctx.s3]) await prog.connect(s).applyForScholarship(7n, H("doc-" + s.address), "");
  return { ...ctx, prog };
}

async function reviewTwice(ctx, id, score = 80) {
  await ctx.prog.connect(ctx.provider).assignReviewers(id, [ctx.r1.address, ctx.r2.address]);
  await ctx.prog.connect(ctx.r1).submitReview(id, score, true, H("n1"));
  await ctx.prog.connect(ctx.r2).submitReview(id, score, true, H("n2"));
}

describe("SchoChain", () => {
  describe("provider registry & factory", () => {
    it("blocks unverified providers from creating programs", async () => {
      const ctx = await deployAll();
      await expect(ctx.factory.connect(ctx.rando).createProgram(await params())).to.be.revertedWith("provider not verified");
      await ctx.registry.connect(ctx.rando).register("Pending Org", "");
      await expect(ctx.factory.connect(ctx.rando).createProgram(await params())).to.be.revertedWith("provider not verified");
    });
    it("only admin can verify / suspend", async () => {
      const ctx = await deployAll();
      await ctx.registry.connect(ctx.rando).register("Org", "");
      await expect(ctx.registry.connect(ctx.rando).verify(ctx.rando.address)).to.be.revertedWith("not owner");
      await ctx.registry.verify(ctx.rando.address);
      await ctx.registry.suspend(ctx.rando.address);
      expect(await ctx.registry.isSuspended(ctx.rando.address)).to.equal(true);
    });
    it("creates programs and indexes them", async () => {
      const ctx = await deployAll();
      const prog = await newProgram(ctx);
      expect(await ctx.factory.isProgram(await prog.getAddress())).to.equal(true);
      expect(await ctx.factory.programCount()).to.equal(1);
      expect((await ctx.factory.programsOf(ctx.provider.address))[0]).to.equal(await prog.getAddress());
      const o = await prog.overview();
      expect(o.title).to.equal("STEM Excellence Grant");
      expect(o.provider).to.equal(ctx.provider.address);
    });
    it("validates parameters", async () => {
      const ctx = await deployAll();
      const f = ctx.factory.connect(ctx.provider);
      await expect(f.createProgram(await params({ awardAmount: 0 }))).to.be.revertedWith("zero award");
      await expect(f.createProgram(await params({ deadline: (await time.latest()) - 1 }))).to.be.revertedWith("bad deadline");
      await expect(f.createProgram(await params({ requiredMask: 8n }))).to.be.revertedWith("mask out of range");
      await expect(f.createProgram(await params({ requiredReviews: 0 }))).to.be.revertedWith("bad review quorum");
    });
    it("implementation and clones cannot be re-initialized", async () => {
      const ctx = await deployAll();
      const prog = await newProgram(ctx);
      const p = await params();
      await expect(prog.initialize(ctx.rando.address, ctx.rando.address, ctx.rando.address, ethers.ZeroAddress, p)).to.be.revertedWith("initialized");
      await expect(ctx.impl.initialize(ctx.rando.address, ctx.rando.address, ctx.rando.address, ethers.ZeroAddress, p)).to.be.revertedWith("initialized");
    });
    it("USDT programs require a configured token", async () => {
      const ctx = await deployAll();
      await ctx.factory.setUsdt(ethers.ZeroAddress);
      await expect(ctx.factory.connect(ctx.provider).createProgram(await params({ currency: 1 }))).to.be.revertedWith("USDT not configured");
    });
    it("factory pause blocks creation", async () => {
      const ctx = await deployAll();
      await ctx.factory.setPaused(true);
      await expect(ctx.factory.connect(ctx.provider).createProgram(await params())).to.be.revertedWith("paused");
    });
  });

  describe("funding", () => {
    it("provider funds BOT; others cannot; plain sends revert", async () => {
      const ctx = await deployAll();
      const prog = await newProgram(ctx);
      await prog.connect(ctx.provider).fund({ value: E("3") });
      expect(await prog.available()).to.equal(E("3"));
      await expect(prog.connect(ctx.rando).fund({ value: E("1") })).to.be.revertedWith("not provider");
      await expect(ctx.rando.sendTransaction({ to: await prog.getAddress(), value: 1 })).to.be.reverted;
    });
    it("provider funds USDT with allowance", async () => {
      const ctx = await deployAll();
      const prog = await newProgram(ctx, { currency: 1, awardAmount: U(100) });
      await ctx.usdt.mint(ctx.provider.address, U(1000));
      await ctx.usdt.connect(ctx.provider).approve(await prog.getAddress(), U(500));
      await prog.connect(ctx.provider).fundToken(U(500));
      expect(await prog.available()).to.equal(U(500));
      await expect(prog.connect(ctx.provider).fund({ value: 1 })).to.be.revertedWith("token program");
    });
  });

  describe("applications", () => {
    it("records applications, prevents duplicates, and indexes by student", async () => {
      const ctx = await seeded();
      expect(await ctx.prog.applicationCount()).to.equal(3);
      await expect(ctx.prog.connect(ctx.s1).applyForScholarship(7n, H("x"), "")).to.be.revertedWith("already applied");
      const refs = await ctx.appReg.applicationsOf(ctx.s1.address);
      expect(refs.length).to.equal(1);
      expect(refs[0].program).to.equal(await ctx.prog.getAddress());
    });
    it("enforces eligibility declarations, hash, deadline, role conflicts", async () => {
      const ctx = await deployAll();
      const prog = await newProgram(ctx);
      await expect(prog.connect(ctx.s1).applyForScholarship(1n, H("a"), "")).to.be.revertedWith("eligibility not declared");
      await expect(prog.connect(ctx.s1).applyForScholarship(3n, ethers.ZeroHash, "")).to.be.revertedWith("document hash required");
      await expect(prog.connect(ctx.provider).applyForScholarship(3n, H("a"), "")).to.be.revertedWith("role conflict");
      await prog.connect(ctx.provider).addReviewer(ctx.r1.address);
      await expect(prog.connect(ctx.r1).applyForScholarship(3n, H("a"), "")).to.be.revertedWith("role conflict");
      await time.increase(31 * DAY);
      await expect(prog.connect(ctx.s1).applyForScholarship(3n, H("a"), "")).to.be.revertedWith("deadline passed");
    });
    it("students can withdraw before a decision", async () => {
      const ctx = await seeded();
      await ctx.prog.connect(ctx.s1).withdrawApplication(1);
      const a = await ctx.prog.getApplication(1);
      expect(a.status).to.equal(Status.Withdrawn);
      expect(await ctx.prog.undecided()).to.equal(2);
      await expect(ctx.prog.connect(ctx.s2).withdrawApplication(1)).to.be.revertedWith("not applicant");
    });
  });

  describe("reviewers", () => {
    it("only authorized, assigned reviewers can review; one review each", async () => {
      const ctx = await seeded();
      await expect(ctx.prog.connect(ctx.rando).assignReviewers(1, [ctx.r1.address])).to.be.revertedWith("not provider");
      await expect(ctx.prog.connect(ctx.provider).assignReviewers(1, [ctx.r3.address])).to.be.revertedWith("not a reviewer");
      await ctx.prog.connect(ctx.provider).assignReviewers(1, [ctx.r1.address]);
      await expect(ctx.prog.connect(ctx.r2).submitReview(1, 50, true, H("n"))).to.be.revertedWith("not assigned");
      await expect(ctx.prog.connect(ctx.rando).submitReview(1, 50, true, H("n"))).to.be.revertedWith("not authorized reviewer");
      await expect(ctx.prog.connect(ctx.r1).submitReview(1, 101, true, H("n"))).to.be.revertedWith("score > 100");
      await ctx.prog.connect(ctx.r1).submitReview(1, 70, true, H("n"));
      await expect(ctx.prog.connect(ctx.r1).submitReview(1, 70, true, H("n"))).to.be.revertedWith("already reviewed");
      expect((await ctx.prog.queueOf(ctx.r1.address)).map(Number)).to.deep.equal([1]);
      expect((await ctx.appReg.reviewerPrograms(ctx.r1.address)).length).to.equal(1);
    });
    it("removed reviewers lose permissions", async () => {
      const ctx = await seeded();
      await ctx.prog.connect(ctx.provider).assignReviewers(1, [ctx.r1.address]);
      await ctx.prog.connect(ctx.provider).removeReviewer(ctx.r1.address);
      await expect(ctx.prog.connect(ctx.r1).submitReview(1, 50, true, H("n"))).to.be.revertedWith("not authorized reviewer");
    });
  });

  describe("decisions & over-allocation", () => {
    it("rejects decisions from non-providers and before quorum", async () => {
      const ctx = await seeded();
      await expect(ctx.prog.connect(ctx.rando).decide(1, true, H("r"))).to.be.revertedWith("not provider");
      await expect(ctx.prog.connect(ctx.r1).decide(1, true, H("r"))).to.be.revertedWith("not provider");
      await expect(ctx.prog.connect(ctx.provider).decide(1, true, H("r"))).to.be.revertedWith("review quorum not met");
    });
    it("caps approvals at maxAwards", async () => {
      const ctx = await seeded();
      for (const id of [1, 2, 3]) await reviewTwice(ctx, id);
      await ctx.prog.connect(ctx.provider).decide(1, true, H("ok"));
      await ctx.prog.connect(ctx.provider).decide(2, true, H("ok"));
      await expect(ctx.prog.connect(ctx.provider).decide(3, true, H("ok"))).to.be.revertedWith("max awards reached");
      await ctx.prog.connect(ctx.provider).decide(3, false, H("no"));
    });
    it("never reserves more than the funded pool", async () => {
      const ctx = await deployAll();
      const prog = await newProgram(ctx, { maxAwards: 5 });
      await prog.connect(ctx.provider).fund({ value: E("1.5") });
      await prog.connect(ctx.provider).addReviewer(ctx.r1.address);
      await prog.connect(ctx.provider).addReviewer(ctx.r2.address);
      for (const s of [ctx.s1, ctx.s2]) await prog.connect(s).applyForScholarship(3n, H("d" + s.address), "");
      const c = { ...ctx, prog };
      await reviewTwice(c, 1); await reviewTwice(c, 2);
      await prog.connect(ctx.provider).decide(1, true, H("ok"));
      await expect(prog.connect(ctx.provider).decide(2, true, H("ok"))).to.be.revertedWith("insufficient pool funds");
      await prog.connect(ctx.provider).fund({ value: E("0.5") });
      await prog.connect(ctx.provider).decide(2, true, H("ok"));
      expect(await prog.committed()).to.equal(E("2"));
    });
    it("revising an approval releases the reservation", async () => {
      const ctx = await seeded();
      await reviewTwice(ctx, 1);
      await ctx.prog.connect(ctx.provider).decide(1, true, H("ok"));
      expect(await ctx.prog.committed()).to.equal(E("1"));
      await ctx.prog.connect(ctx.provider).decide(1, false, H("changed"));
      expect(await ctx.prog.committed()).to.equal(0);
      expect(await ctx.prog.awardCount()).to.equal(0);
      expect(await ctx.prog.undecided()).to.equal(2);
    });
    it("hides unpublished decisions from status and blocks early claims", async () => {
      const ctx = await seeded();
      await reviewTwice(ctx, 1);
      await ctx.prog.connect(ctx.provider).decide(1, true, H("ok"));
      expect((await ctx.prog.getApplication(1)).status).to.equal(Status.InReview);
      await expect(ctx.prog.connect(ctx.s1).claim(1)).to.be.revertedWith("not payable");
      await ctx.prog.connect(ctx.provider).publishDecisions([1]);
      expect((await ctx.prog.getApplication(1)).status).to.equal(Status.Approved);
      await expect(ctx.prog.connect(ctx.provider).decide(1, false, H("late"))).to.be.revertedWith("already published");
    });
  });

  describe("claims & disbursement", () => {
    async function approved() {
      const ctx = await seeded();
      await reviewTwice(ctx, 1);
      await ctx.prog.connect(ctx.provider).decide(1, true, H("ok"));
      await ctx.prog.connect(ctx.provider).publishDecisions([1]);
      return ctx;
    }
    it("student claims once; double claim and impostor fail", async () => {
      const ctx = await approved();
      await expect(ctx.prog.connect(ctx.s2).claim(1)).to.be.revertedWith("not applicant");
      await expect(ctx.prog.connect(ctx.s1).claim(1)).to.changeEtherBalance(ctx.s1, E("1"));
      await expect(ctx.prog.connect(ctx.s1).claim(1)).to.be.revertedWith("not payable");
      await expect(ctx.prog.connect(ctx.provider).disburse(1)).to.be.revertedWith("not payable");
      expect(await ctx.prog.totalPaid()).to.equal(E("1"));
      expect(await ctx.prog.committed()).to.equal(0);
      expect((await ctx.prog.getApplication(1)).status).to.equal(Status.Claimed);
    });
    it("provider can disburse to the student wallet", async () => {
      const ctx = await approved();
      await expect(ctx.prog.connect(ctx.provider).disburse(1)).to.changeEtherBalance(ctx.s1, E("1"));
      await expect(ctx.prog.connect(ctx.rando).disburse(1)).to.be.revertedWith("not provider");
    });
    it("pays USDT awards", async () => {
      const ctx = await deployAll();
      const prog = await newProgram(ctx, { currency: 1, awardAmount: U(250) });
      await ctx.usdt.mint(ctx.provider.address, U(1000));
      await ctx.usdt.connect(ctx.provider).approve(await prog.getAddress(), U(1000));
      await prog.connect(ctx.provider).fundToken(U(1000));
      await prog.connect(ctx.provider).addReviewer(ctx.r1.address);
      await prog.connect(ctx.provider).addReviewer(ctx.r2.address);
      await prog.connect(ctx.s1).applyForScholarship(3n, H("d"), "");
      await reviewTwice({ ...ctx, prog }, 1);
      await prog.connect(ctx.provider).decide(1, true, H("ok"));
      await prog.connect(ctx.provider).publishDecisions([1]);
      await prog.connect(ctx.s1).claim(1);
      expect(await ctx.usdt.balanceOf(ctx.s1.address)).to.equal(U(250));
    });
    it("claims expire and funds are released", async () => {
      const ctx = await approved();
      await expect(ctx.prog.connect(ctx.provider).expireAward(1)).to.be.revertedWith("not expirable");
      await time.increase(31 * DAY);
      await expect(ctx.prog.connect(ctx.s1).claim(1)).to.be.revertedWith("claim window closed");
      await ctx.prog.connect(ctx.provider).expireAward(1);
      expect(await ctx.prog.committed()).to.equal(0);
      expect(await ctx.prog.awardCount()).to.equal(0);
      expect((await ctx.prog.getApplication(1)).status).to.equal(Status.Expired);
    });
  });

  describe("close, cancel & refunds", () => {
    it("close requires deadline passed and all applications decided; surplus is refundable", async () => {
      const ctx = await seeded();
      await expect(ctx.prog.connect(ctx.provider).closeProgram()).to.be.revertedWith("deadline not passed");
      await time.increase(31 * DAY);
      await expect(ctx.prog.connect(ctx.provider).closeProgram()).to.be.revertedWith("undecided applications");
      await expect(ctx.prog.connect(ctx.provider).withdrawSurplus(1)).to.be.revertedWith("program still active");
      await ctx.prog.connect(ctx.s1).withdrawApplication(1);
      await ctx.prog.connect(ctx.s2).withdrawApplication(2);
      await ctx.prog.connect(ctx.s3).withdrawApplication(3);
      await ctx.prog.connect(ctx.provider).closeProgram();
      expect((await ctx.prog.state())).to.equal(State.Closed);
      await expect(ctx.prog.connect(ctx.provider).withdrawSurplus(E("5"))).to.changeEtherBalance(ctx.provider, E("5"));
      await expect(ctx.prog.connect(ctx.provider).withdrawSurplus(1)).to.be.revertedWith("exceeds surplus");
    });
    it("cannot withdraw reserved funds", async () => {
      const ctx = await seeded();
      await reviewTwice(ctx, 1);
      await ctx.prog.connect(ctx.provider).decide(1, true, H("ok"));
      await ctx.prog.connect(ctx.provider).publishDecisions([1]);
      await ctx.prog.connect(ctx.provider).cancelProgram();
      await expect(ctx.prog.connect(ctx.provider).withdrawSurplus(E("4.01"))).to.be.revertedWith("exceeds surplus");
      await ctx.prog.connect(ctx.provider).withdrawSurplus(E("4"));
      await expect(ctx.prog.connect(ctx.s1).claim(1)).to.changeEtherBalance(ctx.s1, E("1")); // published award survives cancel
    });
    it("cancel voids unpublished approvals and marks pending applications cancelled", async () => {
      const ctx = await seeded();
      await reviewTwice(ctx, 1);
      await ctx.prog.connect(ctx.provider).decide(1, true, H("ok"));
      await ctx.prog.connect(ctx.provider).cancelProgram();
      expect(await ctx.prog.committed()).to.equal(0);
      expect(await ctx.prog.awardCount()).to.equal(0);
      expect((await ctx.prog.getApplication(1)).status).to.equal(Status.Cancelled);
      await expect(ctx.prog.connect(ctx.provider).publishDecisions([1])).to.be.revertedWith("cancelled");
      await expect(ctx.prog.connect(ctx.s1).claim(1)).to.be.revertedWith("not payable");
      await expect(ctx.prog.connect(ctx.rando).applyForScholarship(3n, H("z"), "")).to.be.revertedWith("not accepting applications");
    });
    it("only the provider can cancel or close", async () => {
      const ctx = await seeded();
      await expect(ctx.prog.connect(ctx.rando).cancelProgram()).to.be.revertedWith("not provider");
      await expect(ctx.prog.connect(ctx.s1).closeProgram()).to.be.revertedWith("not provider");
    });
  });

  describe("provider suspension", () => {
    it("freezes new activity but keeps student claims working", async () => {
      const ctx = await seeded();
      await reviewTwice(ctx, 1);
      await ctx.prog.connect(ctx.provider).decide(1, true, H("ok"));
      await ctx.prog.connect(ctx.provider).publishDecisions([1]);
      await ctx.registry.suspend(ctx.provider.address);
      await expect(ctx.prog.connect(ctx.rando).applyForScholarship(3n, H("z"), "")).to.be.revertedWith("provider suspended");
      await expect(ctx.prog.connect(ctx.provider).decide(2, false, H("n"))).to.be.revertedWith("provider suspended");
      await expect(ctx.prog.connect(ctx.s1).claim(1)).to.changeEtherBalance(ctx.s1, E("1"));
    });
  });

  describe("application registry access control", () => {
    it("rejects writes from non-program callers", async () => {
      const ctx = await deployAll();
      await expect(ctx.appReg.connect(ctx.rando).recordApplication(ctx.rando.address, 1)).to.be.revertedWith("not a program");
      await expect(ctx.appReg.connect(ctx.rando).recordReviewer(ctx.rando.address)).to.be.revertedWith("not a program");
    });
  });
});
