from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI
import os

# Load ../.env relative to this script
load_dotenv(Path(__file__).parent.parent / ".env")

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

response = client.responses.create(
    model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
    input="What is agent harnessing?"
)

print(response.output_text)