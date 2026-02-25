#!/bin/bash
files=(
"0001_calm_sway"
"0002_overconfident_iron_lad"
"0003_spicy_mother_askani"
"0004_careful_deathbird"
"0005_goofy_piledriver"
"0006_tricky_purifiers"
"0007_flowery_synch"
"0008_clumsy_iron_man"
"0009_acoustic_bloodstrike"
"0010_ancient_maverick"
"0011_sloppy_kitty_pryde"
"0012_fixed_sersi"
"0013_glossy_proudstar"
"0014_petite_moonstone"
)
for file in "${files[@]}"; do
  if [ ! -f "${file}.sql" ]; then
    echo "-- Migration placeholder: $file" > "${file}.sql"
    echo "Created: ${file}.sql"
  fi
done
