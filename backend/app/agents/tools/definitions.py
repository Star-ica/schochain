"""
Tool definitions for the CFOx CFO AI agent.
These are passed to the Anthropic API as tools. The agent calls them;
the backend executes them and returns structured results.

IMPORTANT: No tool here directly executes blockchain transactions.
           All financial actions flow through the policy engine and governance contract.
"""

TOOLS = [
    {
        "name": "get_treasury_balance",
        "description": (
            "Get current treasury balances for all tokens (USDC, native token, etc.) "
            "and the total USD value. Always call this before any financial recommendation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "treasury_id": {
                    "type": "string",
                    "description": "The treasury ID to query"
                }
            },
            "required": ["treasury_id"]
        }
    },
    {
        "name": "get_transactions",
        "description": (
            "Get recent treasury transactions with category, amount, recipient, "
            "and approval details. Use to understand spending patterns."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "treasury_id": {"type": "string"},
                "limit": {
                    "type": "integer",
                    "description": "Number of transactions to return (default 20)",
                    "default": 20
                },
                "direction": {
                    "type": "string",
                    "enum": ["in", "out", "all"],
                    "description": "Filter by inflow or outflow",
                    "default": "all"
                }
            },
            "required": ["treasury_id"]
        }
    },
    {
        "name": "get_members",
        "description": "Get all team members, their equity weights (basis points), roles, and status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "treasury_id": {"type": "string"}
            },
            "required": ["treasury_id"]
        }
    },
    {
        "name": "get_pending_proposals",
        "description": "Get all pending governance proposals — payments, member changes, equity transfers.",
        "input_schema": {
            "type": "object",
            "properties": {
                "treasury_id": {"type": "string"},
                "status": {
                    "type": "string",
                    "enum": ["PENDING", "APPROVED", "all"],
                    "default": "PENDING"
                }
            },
            "required": ["treasury_id"]
        }
    },
    {
        "name": "get_budget_status",
        "description": (
            "Get budget utilization by category (Marketing, Engineering, Payroll, etc.). "
            "Shows budgeted amount, spent, remaining, and percentage used."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "treasury_id": {"type": "string"},
                "period": {
                    "type": "string",
                    "enum": ["current_month", "current_quarter", "ytd"],
                    "default": "current_month"
                }
            },
            "required": ["treasury_id"]
        }
    },
    {
        "name": "get_spending_analytics",
        "description": (
            "Get financial analytics: monthly burn rate, runway (months), "
            "vendor concentration, top expense categories, and spending trends."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "treasury_id": {"type": "string"},
                "months_back": {
                    "type": "integer",
                    "description": "How many months of history to analyze",
                    "default": 3
                }
            },
            "required": ["treasury_id"]
        }
    },
    {
        "name": "create_payment_proposal",
        "description": (
            "Create a payment proposal. This goes through the policy engine: "
            "small amounts may auto-execute; larger amounts create a governance proposal "
            "requiring equity-weighted approval. Returns proposal details and execution mode."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "treasury_id": {"type": "string"},
                "token": {
                    "type": "string",
                    "description": "Token symbol, e.g. 'USDC', 'CELO', 'ETH'"
                },
                "recipient_address": {
                    "type": "string",
                    "description": "0x wallet address of the recipient"
                },
                "amount": {
                    "type": "number",
                    "description": "Amount in human-readable units (e.g. 500 for $500 USDC)"
                },
                "description": {
                    "type": "string",
                    "description": "Purpose of the payment (e.g. 'Monthly design services')"
                },
                "category": {
                    "type": "string",
                    "enum": [
                        "Payroll", "Marketing", "Infrastructure", "Software",
                        "Operations", "Legal", "Travel", "Grants", "Other"
                    ],
                    "description": "Expense category for accounting"
                }
            },
            "required": ["treasury_id", "token", "recipient_address", "amount", "description", "category"]
        }
    },
    {
        "name": "forecast_runway",
        "description": (
            "Calculate and forecast treasury runway given current balance and burn rate. "
            "Can model scenarios (e.g. 'if we add $5k in monthly expenses')."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "treasury_id": {"type": "string"},
                "additional_monthly_burn": {
                    "type": "number",
                    "description": "Additional monthly spend to model (optional scenario)",
                    "default": 0
                },
                "one_time_payment": {
                    "type": "number",
                    "description": "One-time payment to subtract from current balance",
                    "default": 0
                }
            },
            "required": ["treasury_id"]
        }
    },
    {
        "name": "detect_anomaly",
        "description": (
            "Analyze a payment for anomalies: new recipient, duplicate payment, "
            "unusual amount vs history, budget overrun risk, suspicious timing. "
            "Returns a risk score and list of specific concerns."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "treasury_id": {"type": "string"},
                "recipient_address": {"type": "string"},
                "amount": {"type": "number"},
                "token": {"type": "string"},
                "category": {"type": "string"}
            },
            "required": ["treasury_id", "recipient_address", "amount", "token"]
        }
    },
    {
        "name": "get_policy",
        "description": "Get current AI spending policy: per-transaction limit, daily limit, weekly limit, and governance thresholds.",
        "input_schema": {
            "type": "object",
            "properties": {
                "treasury_id": {"type": "string"}
            },
            "required": ["treasury_id"]
        }
    },
    {
        "name": "request_human_approval",
        "description": (
            "Escalate a decision to equity holders. Use when payment seems high risk, "
            "involves a new recipient with large amount, or when you want human oversight "
            "before creating a formal proposal."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "treasury_id": {"type": "string"},
                "reason": {
                    "type": "string",
                    "description": "Why you are escalating this to humans"
                },
                "risk_level": {
                    "type": "string",
                    "enum": ["MEDIUM", "HIGH", "CRITICAL"]
                },
                "context": {
                    "type": "object",
                    "description": "Relevant financial context (amount, recipient, anomalies detected)"
                }
            },
            "required": ["treasury_id", "reason", "risk_level"]
        }
    }
]
