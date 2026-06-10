import os
import io
import json
import pandas as pd
from azure.storage.blob import BlobServiceClient

# ----------------------------------------------------------------------
# Setup
# ----------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_CSV = os.path.join(BASE_DIR, "All_Diets.csv")
RESULTS_DIR = os.path.join(BASE_DIR, "simulated_nosql")
RESULTS_FILE = os.path.join(RESULTS_DIR, "results.json")

CONTAINER = "datasets"
BLOB_NAME = "All_Diets.csv"
MACROS = ["Protein(g)", "Carbs(g)", "Fat(g)"]

# Azurite ships with one fixed, well-known development account. The Azure
# SDK recognises this shortcut and expands it to the full local emulator
# connection string, so we don't have to hardcode the (public, non-secret)
# emulator key ourselves. This is the recommended way to target Azurite.
AZURITE_CONN_STR = "UseDevelopmentStorage=true"


def ensure_blob_uploaded(client):
    """Create the container and upload the CSV if it isn't already there."""
    container = client.get_container_client(CONTAINER)
    try:
        container.create_container()
        print(f"[setup] Created container '{CONTAINER}'")
    except Exception:
        print(f"[setup] Container '{CONTAINER}' already exists")

    blob = container.get_blob_client(BLOB_NAME)
    if not blob.exists():
        with open(LOCAL_CSV, "rb") as f:
            blob.upload_blob(f, overwrite=True)
        print(f"[setup] Uploaded {BLOB_NAME} to Azurite blob storage")
    else:
        print(f"[setup] Blob '{BLOB_NAME}' already uploaded")


def process_nutritional_data_from_azurite():
    """The serverless handler: read blob, compute averages, store to NoSQL."""
    # Connect to the local Azurite emulator.
    client = BlobServiceClient.from_connection_string(AZURITE_CONN_STR)
    ensure_blob_uploaded(client)

    # Download the CSV from Azurite blob storage into memory.
    blob = client.get_container_client(CONTAINER).get_blob_client(BLOB_NAME)
    raw = blob.download_blob().readall()
    df = pd.read_csv(io.BytesIO(raw))

    # Clean / normalise the same way Task 1 does, so results match.
    df.columns = df.columns.str.replace(" ", "", regex=False)
    df["Diet_type"] = df["Diet_type"].str.lower().str.strip()
    for col in MACROS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        df[col] = df[col].fillna(df[col].mean())

    # Calculate average macronutrients per diet type.
    avg_macros = df.groupby("Diet_type")[MACROS].mean().round(2)
    result = avg_macros.reset_index().to_dict(orient="records")

    # Store the results in a simulated NoSQL database (JSON file).
    os.makedirs(RESULTS_DIR, exist_ok=True)
    with open(RESULTS_FILE, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\n[OK] Processed {len(df)} recipes from Azurite blob storage")
    print(f"[OK] Results saved to simulated NoSQL store -> {RESULTS_FILE}\n")
    print(json.dumps(result, indent=2))
    return "Data processed and stored successfully."


if __name__ == "__main__":
    print(process_nutritional_data_from_azurite())
