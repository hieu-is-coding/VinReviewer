# Agentic Academic-Writing Reviewer

Multi-agent pipeline that evaluates academic manuscripts by combining deterministic linguistic feature extraction, literature-grounded evidence checking, and rubric-driven LLM synthesis under red-line supervision with human-in-the-loop final judgment.

## Quick Start

```bash
# Create and activate a virtual environment then
pip install -e ".[dev]"
python -m pip install https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.7.1/en_core_web_sm-3.7.1.tar.gz
docker run -p 8070:8070 lfoppiano/grobid:0.8.0
agentic-reviewer --manuscript paper.pdf --prompt assignment.txt
```

## Architecture

| Phase | Description |
|-------|-------------|
| 0 | Ingestion — GROBID (PDF→TEI/XML), python-docx, language detection |
| 1 | Goal setting — rubric tree construction, literature retrieval |
| 2 | Hard-metric extraction — cohesion, syntax, lexical diversity, mechanics, citations |
| 3 | Deep verification — claim evidence matching, AgentCritic |
| 4 | Synthesis — feature-injected LLM rubric evaluation, red-line supervisor |
| 5 | Human-in-the-loop — calibration, diagnostic output |

## Project Layout

```
src/
  ingest/          GROBID client, DOCX parser, language detector
  agents/          Objective, Retrieval, Critic, Supervisor agents
  features/        Cohesion, style, diversity, mechanics, psycholinguistic extractors
  synthesis/       Prompt construction & LLM review generation
  calibration/     Grade calibration against human scores
  orchestration/   LangGraph state machine
configs/           YAML configs (rubric, features, red-lines)
tests/             Unit & integration tests
data/              Reference corpus, calibration sets
```

## Scope

- **Supported languages**: English
- **Input formats**: PDF, DOCX
- **Grounding**: Semantic Scholar API + SPECTER2 reranking
- **Excluded (v1)**: plagiarism detection, figure/table analysis, real-time co-writing
