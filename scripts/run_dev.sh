python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn sonodyssey.api.main:app --reload
