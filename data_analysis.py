"""
data_analysis.py
Task 1 - Dataset Analysis and Insights (All_Diets.csv)

This script loads the All_Diets.csv dataset, cleans it, calculates the
nutritional insights asked for in the project brief, and produces three
visualizations (bar chart, heatmap, scatter plot).

Run it with:  python data_analysis.py
"""

import os
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# ----------------------------------------------------------------------
# Setup
# ----------------------------------------------------------------------
# Folder where this script lives, so the CSV and outputs are found no
# matter where we run it from.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "All_Diets.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "outputs")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# The three nutrient columns we work with throughout.
MACROS = ["Protein(g)", "Carbs(g)", "Fat(g)"]


def load_data():
    """Read the CSV and tidy up the column names."""
    df = pd.read_csv(CSV_PATH)

    # Remove any accidental spaces in headers (e.g. "Protein (g)" -> "Protein(g)")
    df.columns = df.columns.str.replace(" ", "", regex=False)

    # Make diet type lowercase so "Paleo" and "paleo" count as the same group.
    df["Diet_type"] = df["Diet_type"].str.lower().str.strip()
    return df


def clean_data(df):
    """Handle missing values in the nutrient columns by filling with the mean."""
    for col in MACROS:
        # Make sure the column is numeric; bad values become NaN.
        df[col] = pd.to_numeric(df[col], errors="coerce")
        # Fill the empty/NaN entries with that column's average.
        df[col] = df[col].fillna(df[col].mean())
    return df


def add_ratios(df):
    """Create the two new metrics asked for in the brief."""
    df["Protein_to_Carbs_ratio"] = df["Protein(g)"] / df["Carbs(g)"]
    df["Carbs_to_Fat_ratio"] = df["Carbs(g)"] / df["Fat(g)"]
    return df


# ----------------------------------------------------------------------
# Analysis functions
# ----------------------------------------------------------------------
def average_macros(df):
    """Average protein, carbs and fat for each diet type."""
    return df.groupby("Diet_type")[MACROS].mean().round(2)


def top5_protein(df):
    """Top 5 protein-rich recipes for each diet type."""
    return (
        df.sort_values("Protein(g)", ascending=False)
        .groupby("Diet_type")
        .head(5)[["Diet_type", "Recipe_name", "Cuisine_type", "Protein(g)"]]
    )


def highest_protein_diet(avg_macros):
    """The diet type with the highest average protein content."""
    return avg_macros["Protein(g)"].idxmax(), avg_macros["Protein(g)"].max()


def common_cuisines(df):
    """The most common cuisine for each diet type."""
    return df.groupby("Diet_type")["Cuisine_type"].agg(
        lambda x: x.value_counts().idxmax()
    )


# ----------------------------------------------------------------------
# Visualizations
# ----------------------------------------------------------------------
def plot_bar(avg_macros):
    """Grouped bar chart of average macros per diet type."""
    avg_macros.plot(kind="bar", figsize=(10, 6))
    plt.title("Average Macronutrient Content by Diet Type")
    plt.ylabel("Average grams")
    plt.xlabel("Diet Type")
    plt.xticks(rotation=45)
    plt.legend(title="Macronutrient")
    plt.tight_layout()
    path = os.path.join(OUTPUT_DIR, "bar_avg_macros.png")
    plt.savefig(path)
    plt.close()
    print(f"Saved bar chart -> {path}")


def plot_heatmap(avg_macros):
    """Heatmap showing macros vs diet types."""
    plt.figure(figsize=(8, 6))
    sns.heatmap(avg_macros, annot=True, fmt=".1f", cmap="YlGnBu")
    plt.title("Macronutrient Content Across Diet Types")
    plt.ylabel("Diet Type")
    plt.tight_layout()
    path = os.path.join(OUTPUT_DIR, "heatmap_macros.png")
    plt.savefig(path)
    plt.close()
    print(f"Saved heatmap -> {path}")


def plot_scatter(top_protein):
    """Scatter plot of the top 5 protein recipes across cuisines."""
    plt.figure(figsize=(11, 6))
    sns.scatterplot(
        data=top_protein,
        x="Cuisine_type",
        y="Protein(g)",
        hue="Diet_type",
        s=120,
    )
    plt.title("Top 5 Protein-Rich Recipes per Diet Type (by Cuisine)")
    plt.xlabel("Cuisine Type")
    plt.ylabel("Protein (g)")
    plt.xticks(rotation=45, ha="right")
    plt.legend(title="Diet Type", bbox_to_anchor=(1.02, 1), loc="upper left")
    plt.tight_layout()
    path = os.path.join(OUTPUT_DIR, "scatter_top_protein.png")
    plt.savefig(path)
    plt.close()
    print(f"Saved scatter plot -> {path}")


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------
def main():
    print("=" * 60)
    print("TASK 1 - DIET DATASET ANALYSIS")
    print("=" * 60)

    df = load_data()
    print(f"\nLoaded {len(df)} recipes with columns: {list(df.columns)}")

    df = clean_data(df)
    df = add_ratios(df)

    # 1. Average macronutrients per diet type
    avg = average_macros(df)
    print("\n--- Average macronutrient content by diet type ---")
    print(avg)

    # 2. Top 5 protein-rich recipes per diet type
    top = top5_protein(df)
    print("\n--- Top 5 protein-rich recipes per diet type ---")
    print(top.to_string(index=False))

    # 3. Diet type with the highest protein
    diet, value = highest_protein_diet(avg)
    print(f"\n--- Highest average protein diet type ---")
    print(f"{diet}  ({value} g average protein)")

    # 4. Most common cuisine per diet type
    cuisines = common_cuisines(df)
    print("\n--- Most common cuisine per diet type ---")
    print(cuisines)

    # 5. New ratio metrics (show a small sample)
    print("\n--- New metrics: ratios (first 5 rows) ---")
    print(
        df[["Recipe_name", "Protein_to_Carbs_ratio", "Carbs_to_Fat_ratio"]]
        .head()
        .round(2)
        .to_string(index=False)
    )

    # Save the cleaned dataset with the new columns for reference.
    cleaned_path = os.path.join(OUTPUT_DIR, "cleaned_with_ratios.csv")
    df.to_csv(cleaned_path, index=False)
    print(f"\nSaved cleaned dataset -> {cleaned_path}")

    # Visualizations
    print("\n--- Creating visualizations ---")
    plot_bar(avg)
    plot_heatmap(avg)
    plot_scatter(top)

    print("\nDone. Charts are in the 'outputs' folder.")


if __name__ == "__main__":
    main()
