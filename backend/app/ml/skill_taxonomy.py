"""Canonical normalized skill taxonomy with category classification and synonym aliases."""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Skill, SkillAlias


@dataclass(frozen=True)
class SkillDefinition:
    canonical_name: str
    slug: str
    category: str
    aliases: tuple[str, ...] = ()
    description: str = ""


# Categories required by spec:
# language, framework, library, database, cloud, tool, soft_skill
CANONICAL_SKILLS: tuple[SkillDefinition, ...] = (
    # Programming languages
    SkillDefinition("Python", "python", "language", ("python3", "py"), "General-purpose and ML programming language"),
    SkillDefinition("TypeScript", "typescript", "language", ("ts",), "Typed superset of JavaScript"),
    SkillDefinition("JavaScript", "javascript", "language", ("js", "ecmascript", "es6"), "Web programming language"),
    SkillDefinition("Go", "go", "language", ("golang",), "Systems and backend programming language"),
    SkillDefinition("Rust", "rust", "language", ("rustlang",), "Memory-safe systems programming language"),
    SkillDefinition("C++", "cpp", "language", ("c++", "cpp", "c/c++"), "High-performance systems language"),
    SkillDefinition("C", "c", "language", ("c language",), "Low-level systems programming language"),
    SkillDefinition("Java", "java", "language", ("java8", "java17", "java21"), "JVM enterprise programming language"),
    SkillDefinition("SQL", "sql", "language", ("pl/sql", "t-sql"), "Structured query language"),
    SkillDefinition("Bash", "bash", "language", ("shell", "zsh", "shell scripting"), "Unix shell scripting"),
    SkillDefinition("CUDA", "cuda", "language", ("cuda c++",), "NVIDIA GPU parallel computing platform"),
    # Frameworks
    SkillDefinition("React", "react", "framework", ("react.js", "reactjs", "react js"), "Component-based UI library/framework"),
    SkillDefinition("Next.js", "nextjs", "framework", ("nextjs", "next.js", "next js"), "React full-stack framework"),
    SkillDefinition("FastAPI", "fastapi", "framework", ("fast api",), "High-performance async Python API framework"),
    SkillDefinition("Django", "django", "framework", ("drf", "django rest framework"), "Batteries-included Python web framework"),
    SkillDefinition("Flask", "flask", "framework", (), "Lightweight Python web microframework"),
    SkillDefinition("PyTorch", "pytorch", "framework", ("torch",), "Deep learning framework"),
    SkillDefinition("TensorFlow", "tensorflow", "framework", ("tf", "tf2"), "Deep learning framework"),
    SkillDefinition("LangGraph", "langgraph", "framework", ("lang graph",), "Stateful multi-actor LLM orchestration"),
    SkillDefinition("LangChain", "langchain", "framework", ("lang chain",), "LLM application framework"),
    SkillDefinition("LlamaIndex", "llamaindex", "framework", ("llama-index", "gpt-index"), "Data framework for LLM RAG"),
    SkillDefinition("Tailwind CSS", "tailwindcss", "framework", ("tailwind", "tailwind css"), "Utility-first CSS framework"),
    SkillDefinition("Spring Boot", "spring-boot", "framework", ("spring", "spring boot"), "Java microservice framework"),
    # Libraries
    SkillDefinition("Sentence Transformers", "sentence-transformers", "library", ("sentence-transformers", "sbert"), "Dense text and sentence embeddings"),
    SkillDefinition("Scikit-learn", "scikit-learn", "library", ("sklearn", "scikit learn"), "Classical machine learning library"),
    SkillDefinition("LightGBM", "lightgbm", "library", ("lgbm",), "Gradient boosting and LambdaMART ranking library"),
    SkillDefinition("XGBoost", "xgboost", "library", ("xgb",), "Gradient boosted decision trees library"),
    SkillDefinition("Hugging Face Transformers", "huggingface-transformers", "library", ("hugging face", "huggingface", "transformers"), "Pretrained transformer model hub & library"),
    SkillDefinition("FAISS", "faiss", "library", (), "Facebook AI Similarity Search vector library"),
    SkillDefinition("BM25", "bm25", "library", ("rank-bm25", "okapi bm25"), "Sparse lexical retrieval ranking function"),
    SkillDefinition("Pandas", "pandas", "library", (), "Tabular data manipulation library"),
    SkillDefinition("NumPy", "numpy", "library", (), "Numerical array computing library"),
    SkillDefinition("vLLM", "vllm", "library", (), "High-throughput LLM inference engine"),
    SkillDefinition("Pydantic", "pydantic", "library", ("pydantic v2",), "Data validation and schema modeling"),
    SkillDefinition("SQLAlchemy", "sqlalchemy", "library", ("sqlalchemy 2",), "Python SQL toolkit and ORM"),
    # Databases
    SkillDefinition("PostgreSQL", "postgresql", "database", ("postgres", "psql"), "Relational database system"),
    SkillDefinition("pgvector", "pgvector", "database", ("pg-vector",), "PostgreSQL vector similarity extension"),
    SkillDefinition("Redis", "redis", "database", (), "In-memory cache, broker, and data store"),
    SkillDefinition("MongoDB", "mongodb", "database", ("mongo",), "Document NoSQL database"),
    SkillDefinition("Elasticsearch", "elasticsearch", "database", ("elastic", "opensearch"), "Distributed search & analytics engine"),
    SkillDefinition("Snowflake", "snowflake", "database", (), "Cloud data warehouse"),
    SkillDefinition("BigQuery", "bigquery", "database", (), "Google Cloud serverless data warehouse"),
    SkillDefinition("Apache Kafka", "kafka", "database", ("kafka",), "Distributed event streaming platform"),
    # Cloud technologies
    SkillDefinition("AWS", "aws", "cloud", ("amazon web services", "ec2", "s3", "eks", "sagemaker"), "Amazon Web Services cloud platform"),
    SkillDefinition("GCP", "gcp", "cloud", ("google cloud", "google cloud platform", "vertex ai"), "Google Cloud Platform"),
    SkillDefinition("Azure", "azure", "cloud", ("microsoft azure",), "Microsoft Azure cloud platform"),
    SkillDefinition("Kubernetes", "kubernetes", "cloud", ("k8s",), "Container orchestration platform"),
    SkillDefinition("Docker", "docker", "cloud", ("docker compose", "containers"), "Containerization platform"),
    SkillDefinition("Terraform", "terraform", "cloud", ("iac",), "Infrastructure as code"),
    SkillDefinition("Linux", "linux", "cloud", ("ubuntu", "debian", "ebpf"), "Linux operating system and kernel tooling"),
    # Tools
    SkillDefinition("Git", "git", "tool", ("github", "gitlab"), "Distributed version control"),
    SkillDefinition("GitHub Actions", "github-actions", "tool", ("ci/cd", "github actions"), "CI/CD workflow automation"),
    SkillDefinition("Celery", "celery", "tool", ("celery beat",), "Distributed task queue"),
    SkillDefinition("Alembic", "alembic", "tool", (), "Database schema migration tool"),
    SkillDefinition("Pytest", "pytest", "tool", (), "Python automated testing framework"),
    SkillDefinition("OpenTelemetry", "opentelemetry", "tool", ("otel",), "Observability tracing and metrics framework"),
    SkillDefinition("Prometheus", "prometheus", "tool", (), "Monitoring and alerting toolkit"),
    SkillDefinition("Grafana", "grafana", "tool", (), "Observability dashboards"),
    SkillDefinition("NCCL", "nccl", "tool", (), "NVIDIA Collective Communications Library"),
    # Soft skills
    SkillDefinition("System Design", "system-design", "soft_skill", ("architecture design", "distributed systems design"), "Large-scale software & ML system architecture"),
    SkillDefinition("Technical Leadership", "technical-leadership", "soft_skill", ("tech lead", "mentoring", "mentorship"), "Leading engineering initiatives and mentoring"),
    SkillDefinition("Cross-Functional Collaboration", "cross-functional-collaboration", "soft_skill", ("stakeholder communication", "collaboration"), "Working effectively across product, research, and engineering"),
    SkillDefinition("Technical Writing", "technical-writing", "soft_skill", ("documentation", "rfc"), "Writing clear specs, RFCs, and documentation"),
)


def build_alias_lookup() -> dict[str, SkillDefinition]:
    """Return lowercase alias/canonical_name -> SkillDefinition lookup."""
    lookup: dict[str, SkillDefinition] = {}
    for s in CANONICAL_SKILLS:
        lookup[s.canonical_name.lower()] = s
        lookup[s.slug.lower()] = s
        for alias in s.aliases:
            lookup[alias.lower()] = s
    return lookup


ALIAS_LOOKUP: dict[str, SkillDefinition] = build_alias_lookup()


def normalize_skill_name(raw_name: str) -> SkillDefinition | None:
    """Map raw skill token/alias (e.g., 'React.js', 'ReactJS') to canonical SkillDefinition."""
    key = (raw_name or "").strip().lower()
    if key in ALIAS_LOOKUP:
        return ALIAS_LOOKUP[key]
    compact = key.replace(".js", "").replace(" ", "")
    for alias, sdef in ALIAS_LOOKUP.items():
        if alias.replace(".js", "").replace(" ", "") == compact:
            return sdef
    return None


def sync_taxonomy_to_db(db: Session) -> dict[str, Skill]:
    """Ensure all canonical skills and aliases exist in DB; return slug -> Skill map."""
    existing_skills = {s.slug: s for s in db.scalars(select(Skill)).all()}
    existing_aliases = {a.alias: a for a in db.scalars(select(SkillAlias)).all()}

    for sdef in CANONICAL_SKILLS:
        skill = existing_skills.get(sdef.slug)
        if skill is None:
            skill = Skill(
                canonical_name=sdef.canonical_name,
                slug=sdef.slug,
                category=sdef.category,
                description=sdef.description,
            )
            db.add(skill)
            db.flush()
            existing_skills[sdef.slug] = skill

        for raw_alias in (sdef.canonical_name.lower(), sdef.slug.lower(), *(a.lower() for a in sdef.aliases)):
            if raw_alias not in existing_aliases:
                alias_row = SkillAlias(skill_id=skill.id, alias=raw_alias)
                db.add(alias_row)
                existing_aliases[raw_alias] = alias_row

    db.flush()
    return existing_skills
