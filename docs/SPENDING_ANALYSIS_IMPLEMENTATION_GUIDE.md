# Spending Analysis Implementation Guide

## Overview

This guide outlines the full stack implementation for the spending analysis feature:

- **Backend**: FastAPI endpoint to accept spending data, call LLM, validate output, return to frontend
- **Frontend**: Expo React Native form to collect transactions, display analysis results
- **Database**: Models to store spending transactions and analysis history
- **LLM Integration**: Prompt-based analysis using OpenAI/Anthropic APIs

---

## Architecture Diagram

```
Frontend (Expo)
  ↓
  ├─ User inputs spending transactions
  ├─ Submits to /api/spending/analyze (POST)
  ↓
FastAPI Backend
  ├─ Validate input against schema
  ├─ Query spending data from MySQL/PostgreSQL
  ├─ Call LLM (OpenAI/Anthropic) with system prompt + user data
  ├─ Validate LLM output against schema
  ├─ Store analysis in database
  ├─ Return JSON response
  ↓
Frontend
  ├─ Parse response
  ├─ Display summary, charts, risk flags, recommendations
  ├─ Cache response locally (optional)
```

---

## Backend Implementation Steps

### 1. **Database Models** (`app/models/spending.py`)

```python
from datetime import datetime
from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class PaymentMethod(str, enum.Enum):
    CASH = "cash"
    DEBIT = "debit"
    CREDIT = "credit"
    BNPL = "bnpl"
    TRANSFER = "transfer"
    OTHER = "other"

class SpendingTransaction(Base):
    __tablename__ = "spending_transactions"

    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("user.id"), index=True)
    date = Column(DateTime, index=True)
    category = Column(String(50), index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(3), default="MYR")
    payment_method = Column(String(20), nullable=False)
    is_recurring = Column(Boolean, default=False)
    description = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="spending_transactions")
    analyses = relationship("SpendingAnalysis", back_populates="transactions")

class SpendingAnalysis(Base):
    __tablename__ = "spending_analyses"

    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("user.id"), index=True)
    period_start = Column(DateTime, index=True)
    period_end = Column(DateTime, index=True)
    analysis_result = Column(String(5000), nullable=False)  # JSON string
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", back_populates="spending_analyses")
```

### 2. **Schemas** (`app/schemas/spending.py`)

```python
from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import List, Optional, Dict, Any
from enum import Enum

class PaymentMethodEnum(str, Enum):
    CASH = "cash"
    DEBIT = "debit"
    CREDIT = "credit"
    BNPL = "bnpl"
    TRANSFER = "transfer"
    OTHER = "other"

class SpendingTransactionIn(BaseModel):
    date: datetime
    category: str
    amount: float
    payment_method: PaymentMethodEnum
    is_recurring: bool = False
    description: Optional[str] = None

    @validator("category")
    def category_lowercase(cls, v):
        return v.lower().replace(" ", "_")

    @validator("amount")
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v

class CategoryRules(BaseModel):
    fixed_categories: Optional[List[str]] = None
    flexible_categories: Optional[List[str]] = None
    essential_categories: Optional[List[str]] = None
    non_essential_categories: Optional[List[str]] = None

class RiskThresholds(BaseModel):
    bnpl_share_warning: float = 0.15
    bnpl_share_high: float = 0.25
    category_spike_pct: float = 0.30
    single_category_concentration_warning: float = 0.40

class SpendingAnalysisRequestIn(BaseModel):
    currency: str = "MYR"
    period: Dict[str, Any]  # { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "granularity": "monthly" }
    spending: List[SpendingTransactionIn]
    category_rules: Optional[CategoryRules] = None
    risk_thresholds: Optional[RiskThresholds] = None

class SpendingAnalysisResponseOut(BaseModel):
    summary: Dict[str, Any]
    patterns_over_time: List[str]
    fixed_vs_flexible: Dict[str, Any]
    risk_flags: List[Dict[str, Any]]
    recommendations: List[str]
    user_facing_message: str
    metadata: Dict[str, Any]

class SpendingAnalysisErrorResponse(BaseModel):
    error: bool = True
    error_code: str
    error_message: str
    details: Optional[Dict[str, Any]] = None
```

### 3. **LLM Service** (`app/services/spending_analysis_service.py`)

````python
import json
import logging
from typing import Dict, Any, Optional
import httpx
from app.core.config import get_settings
from app.schemas.spending import SpendingAnalysisRequestIn, SpendingAnalysisResponseOut

settings = get_settings()
logger = logging.getLogger(__name__)

class SpendingAnalysisService:
    """Service for LLM-based spending analysis."""

    SYSTEM_PROMPT = """You are a personal finance analysis assistant integrated into a budgeting mobile app...
    [Full system prompt from SPENDING_ANALYSIS_SYSTEM_PROMPT.md]
    """

    def __init__(self, api_key: str, model: str = "claude-3.5-sonnet"):
        self.api_key = api_key
        self.model = model
        self.base_url = "https://api.anthropic.com/v1"
        if "gpt" in model:
            self.base_url = "https://api.openai.com/v1"

    async def analyze(self, request: SpendingAnalysisRequestIn) -> Dict[str, Any]:
        """Analyze spending data via LLM."""
        try:
            # Prepare payload with full system prompt
            user_message = json.dumps(request.dict(), indent=2)

            if "gpt" in self.model:
                return await self._call_openai(user_message)
            else:
                return await self._call_anthropic(user_message)
        except Exception as e:
            logger.error(f"Spending analysis error: {e}")
            return {
                "error": True,
                "error_code": "LLM_ERROR",
                "error_message": str(e)
            }

    async def _call_anthropic(self, user_message: str) -> Dict[str, Any]:
        """Call Anthropic Claude API."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": 2048,
                    "system": self.SYSTEM_PROMPT,
                    "messages": [
                        {
                            "role": "user",
                            "content": user_message,
                        }
                    ],
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            content = data["content"][0]["text"]
            return self._parse_response(content)

    async def _call_openai(self, user_message: str) -> Dict[str, Any]:
        """Call OpenAI GPT API."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": 2048,
                    "messages": [
                        {
                            "role": "system",
                            "content": self.SYSTEM_PROMPT,
                        },
                        {
                            "role": "user",
                            "content": user_message,
                        },
                    ],
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            return self._parse_response(content)

    def _parse_response(self, content: str) -> Dict[str, Any]:
        """Extract and validate JSON from LLM response."""
        try:
            # Try direct JSON parse
            return json.loads(content)
        except json.JSONDecodeError:
            # Try extracting JSON from markdown code blocks
            if "```json" in content:
                start = content.find("```json") + 7
                end = content.find("```", start)
                return json.loads(content[start:end].strip())
            elif "```" in content:
                start = content.find("```") + 3
                end = content.find("```", start)
                return json.loads(content[start:end].strip())
            else:
                raise ValueError("Could not parse LLM response")

    def validate_response(self, data: Dict[str, Any]) -> bool:
        """Validate response against output schema."""
        required_keys = {
            "summary", "patterns_over_time", "fixed_vs_flexible",
            "risk_flags", "recommendations", "user_facing_message", "metadata"
        }
        if not all(k in data for k in required_keys):
            return False
        return True
````

### 4. **Routes** (`app/routes/spending.py`)

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import uuid
from datetime import datetime

from app.core.database import get_db
from app.core.config import get_settings
from app.schemas.spending import SpendingAnalysisRequestIn, SpendingAnalysisResponseOut
from app.services.spending_analysis_service import SpendingAnalysisService
from app.models.spending import SpendingTransaction, SpendingAnalysis

router = APIRouter(prefix="/api/spending", tags=["spending"])
settings = get_settings()

# Initialize LLM service
llm_service = SpendingAnalysisService(
    api_key=settings.LLM_API_KEY,
    model=settings.LLM_MODEL
)

@router.post("/analyze", response_model=SpendingAnalysisResponseOut)
async def analyze_spending(
    request: SpendingAnalysisRequestIn,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)  # Assumes auth middleware exists
):
    """Analyze user spending patterns and habits."""
    try:
        # Call LLM service
        analysis_result = await llm_service.analyze(request)

        # Validate response
        if analysis_result.get("error"):
            raise HTTPException(status_code=400, detail=analysis_result)

        if not llm_service.validate_response(analysis_result):
            raise HTTPException(status_code=500, detail="Invalid LLM response format")

        # Store analysis in database
        db_analysis = SpendingAnalysis(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            period_start=datetime.fromisoformat(request.period["start"]),
            period_end=datetime.fromisoformat(request.period["end"]),
            analysis_result=json.dumps(analysis_result)
        )
        db.add(db_analysis)
        await db.commit()

        return SpendingAnalysisResponseOut(**analysis_result)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history")
async def get_analysis_history(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
    limit: int = 10
):
    """Retrieve user's previous spending analyses."""
    # Query database for analyses
    # Return as list
    pass
```

### 5. **Configuration** (`app/core/config.py` additions)

```python
class Settings(BaseSettings):
    # ... existing settings ...

    LLM_API_KEY: str = Field(..., env="LLM_API_KEY")  # OpenAI or Anthropic API key
    LLM_MODEL: str = Field("claude-3.5-sonnet", env="LLM_MODEL")
    LLM_CACHE_ENABLED: bool = Field(True, env="LLM_CACHE_ENABLED")
```

---

## Frontend Implementation (Expo)

### 1. **Spending Input Form** (`app/spending-form.tsx`)

```typescript
import React, { useState } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Text,
  Alert,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SpendingAPI } from "@/services/api";

export default function SpendingFormScreen() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const handleAddTransaction = () => {
    setTransactions([
      ...transactions,
      {
        date: new Date(),
        category: "",
        amount: 0,
        payment_method: "cash",
        is_recurring: false,
      },
    ]);
  };

  const handleSubmitAnalysis = async () => {
    if (transactions.length === 0) {
      Alert.alert("Error", "Please add at least one transaction");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        currency: "MYR",
        period: {
          start: "2025-11-01",
          end: "2025-12-31",
          granularity: "monthly",
        },
        spending: transactions,
      };

      const result = await SpendingAPI.analyze(payload);
      setAnalysis(result);
    } catch (error) {
      Alert.alert("Error", "Failed to analyze spending");
    } finally {
      setLoading(false);
    }
  };

  if (analysis) {
    return <AnalysisResultsScreen data={analysis} />;
  }

  return (
    <ScrollView>
      {/* Transaction form fields */}
      {transactions.map((tx, idx) => (
        <TransactionForm
          key={idx}
          transaction={tx}
          onChange={(updated) => {
            const updated_transactions = [...transactions];
            updated_transactions[idx] = updated;
            setTransactions(updated_transactions);
          }}
        />
      ))}

      <TouchableOpacity onPress={handleAddTransaction}>
        <Text>+ Add Transaction</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleSubmitAnalysis} disabled={loading}>
        <Text>{loading ? "Analyzing..." : "Analyze Spending"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
```

### 2. **Analysis Results Display** (`app/analysis-results.tsx`)

```typescript
import React from "react";
import { View, ScrollView, Text, StyleSheet } from "react-native";
import { DonutProgress } from "@/components/donut_progress";

export default function AnalysisResultsScreen({ data }) {
  return (
    <ScrollView style={styles.container}>
      {/* Headline */}
      <Text style={styles.headline}>{data.user_facing_message}</Text>

      {/* Summary Metrics */}
      <View style={styles.metricsContainer}>
        <DonutProgress
          percentage={data.summary.non_essential_share * 100}
          label="Non-Essential"
        />
        <DonutProgress
          percentage={data.summary.bnpl_share * 100}
          label="BNPL"
        />
      </View>

      {/* Risk Flags */}
      <View style={styles.riskSection}>
        <Text style={styles.sectionTitle}>Risk Alerts</Text>
        {data.risk_flags.map((flag, idx) => (
          <View
            key={idx}
            style={[
              styles.riskCard,
              {
                borderLeftColor:
                  flag.severity === "high"
                    ? "red"
                    : flag.severity === "medium"
                      ? "orange"
                      : "yellow",
              },
            ]}
          >
            <Text style={styles.riskType}>{flag.type}</Text>
            <Text style={styles.riskEvidence}>{flag.evidence}</Text>
          </View>
        ))}
      </View>

      {/* Recommendations */}
      <View style={styles.recommendationSection}>
        <Text style={styles.sectionTitle}>Recommendations</Text>
        {data.recommendations.map((rec, idx) => (
          <Text key={idx} style={styles.recommendationItem}>
            • {rec}
          </Text>
        ))}
      </View>

      {/* Patterns */}
      <View style={styles.patternSection}>
        <Text style={styles.sectionTitle}>Spending Patterns</Text>
        {data.patterns_over_time.map((pattern, idx) => (
          <Text key={idx} style={styles.patternItem}>
            • {pattern}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headline: { fontSize: 18, fontWeight: "bold", marginBottom: 16 },
  metricsContainer: { flexDirection: "row", justifyContent: "space-around" },
  riskSection: { marginTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 12 },
  riskCard: {
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    backgroundColor: "#f5f5f5",
  },
  riskType: { fontWeight: "bold" },
  riskEvidence: { fontSize: 12, marginTop: 4 },
  recommendationSection: { marginTop: 24 },
  recommendationItem: { marginBottom: 8 },
  patternSection: { marginTop: 24 },
  patternItem: { marginBottom: 8 },
});
```

---

## Deployment Checklist

- [ ] Add `LLM_API_KEY` and `LLM_MODEL` to environment variables (`.env`)
- [ ] Run database migrations (Alembic) to add spending tables
- [ ] Set up LLM account (OpenAI or Anthropic) and obtain API key
- [ ] Test spending analysis endpoint with sample data
- [ ] Validate output against schema on frontend
- [ ] Add error handling for LLM timeouts or failures
- [ ] Cache analyses locally in frontend to reduce API calls
- [ ] Add analytics tracking for feature usage

---

## Testing Strategy

### Backend

1. Unit tests for `SpendingAnalysisService`
2. Integration tests for `/api/spending/analyze` endpoint
3. Schema validation tests (input + output)
4. LLM response parsing edge cases

### Frontend

1. Form submission and input validation
2. API integration tests
3. Result display rendering
4. Error state handling

### Example Backend Test

```python
@pytest.mark.asyncio
async def test_spending_analysis():
    request = SpendingAnalysisRequestIn(
        currency="MYR",
        period={"start": "2025-11-01", "end": "2025-12-31", "granularity": "monthly"},
        spending=[
            {
                "date": "2025-11-05",
                "category": "f&b",
                "amount": 45.50,
                "payment_method": "cash",
                "is_recurring": False,
            }
        ],
    )
    service = SpendingAnalysisService(api_key="test_key")
    result = await service.analyze(request)
    assert "summary" in result
    assert result["summary"]["total_spending"] > 0
```

---

## Next Steps

1. Create database models and run migrations
2. Implement FastAPI endpoints and LLM service
3. Build frontend form and results UI
4. Integrate with authentication (current user context)
5. Add caching and history retrieval logic
6. Write comprehensive tests
7. Deploy to staging environment
8. Gather user feedback and iterate
