#!/usr/bin/env bash
# Obtiene el clima actual (por defecto, ubicación detectada por IP) usando
# ipapi.co (geolocalización) y open-meteo.com (clima). Ninguna requiere API key.
#
# Uso:
#   get-weather.sh                # clima en la ubicación detectada por IP
#   get-weather.sh "Madrid"       # clima en una ciudad (geocoding por nombre)
#   get-weather.sh 40.4168 -3.7038 # clima en lat/lon exactos

set -euo pipefail

WEATHER_CODES_JSON='{
  "0": "Despejado", "1": "Mayormente despejado", "2": "Parcialmente nublado", "3": "Nublado",
  "45": "Niebla", "48": "Niebla con escarcha",
  "51": "Llovizna ligera", "53": "Llovizna moderada", "55": "Llovizna densa",
  "56": "Llovizna helada ligera", "57": "Llovizna helada densa",
  "61": "Lluvia ligera", "63": "Lluvia moderada", "65": "Lluvia fuerte",
  "66": "Lluvia helada ligera", "67": "Lluvia helada fuerte",
  "71": "Nevada ligera", "73": "Nevada moderada", "75": "Nevada fuerte",
  "77": "Granos de nieve",
  "80": "Chubascos ligeros", "81": "Chubascos moderados", "82": "Chubascos violentos",
  "85": "Chubascos de nieve ligeros", "86": "Chubascos de nieve fuertes",
  "95": "Tormenta", "96": "Tormenta con granizo ligero", "99": "Tormenta con granizo fuerte"
}'

describe_code() {
  local code="$1"
  echo "$WEATHER_CODES_JSON" | grep -o "\"$code\": \"[^\"]*\"" | sed -E 's/.*: "(.*)"/\1/' || echo "Código $code"
}

get_by_ip() {
  local geo
  geo=$(curl -sf "https://ipapi.co/json/")
  LAT=$(echo "$geo" | grep -o '"latitude" *: *[^,]*' | grep -o '[-0-9.]*$')
  LON=$(echo "$geo" | grep -o '"longitude" *: *[^,]*' | grep -o '[-0-9.]*$')
  PLACE=$(echo "$geo" | grep -o '"city" *: *"[^"]*"' | sed -E 's/.*: *"(.*)"/\1/')
}

get_by_city() {
  local city="$1"
  local geo
  geo=$(curl -sf "https://geocoding-api.open-meteo.com/v1/search?name=$(printf '%s' "$city" | sed 's/ /%20/g')&count=1&language=es")
  LAT=$(echo "$geo" | grep -o '"latitude" *: *[^,]*' | head -1 | grep -o '[-0-9.]*$')
  LON=$(echo "$geo" | grep -o '"longitude" *: *[^,]*' | head -1 | grep -o '[-0-9.]*$')
  PLACE=$(echo "$geo" | grep -o '"name" *: *"[^"]*"' | head -1 | sed -E 's/.*: *"(.*)"/\1/')
  if [ -z "$LAT" ] || [ -z "$LON" ]; then
    echo "No se encontró la ciudad: $city" >&2
    exit 1
  fi
}

if [ "$#" -eq 0 ]; then
  get_by_ip
elif [ "$#" -eq 1 ]; then
  get_by_city "$1"
elif [ "$#" -eq 2 ]; then
  LAT="$1"
  LON="$2"
  PLACE="lat=$LAT, lon=$LON"
else
  echo "Uso: get-weather.sh [ciudad | lat lon]" >&2
  exit 1
fi

DATA=$(curl -sf "https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto")

TEMP=$(echo "$DATA" | grep -o '"temperature_2m":[-0-9.]*' | grep -o '[-0-9.]*$')
FEELS=$(echo "$DATA" | grep -o '"apparent_temperature":[-0-9.]*' | grep -o '[-0-9.]*$')
HUMIDITY=$(echo "$DATA" | grep -o '"relative_humidity_2m":[-0-9.]*' | grep -o '[-0-9.]*$')
WIND=$(echo "$DATA" | grep -o '"wind_speed_10m":[-0-9.]*' | grep -o '[-0-9.]*$')
CODE=$(echo "$DATA" | grep -o '"weather_code":[-0-9.]*' | grep -o '[-0-9.]*$')
PRECIP=$(echo "$DATA" | grep -o '"precipitation":[-0-9.]*' | grep -o '[-0-9.]*$')

echo "Ubicación: $PLACE"
echo "Condición: $(describe_code "$CODE")"
echo "Temperatura: ${TEMP}°C (sensación ${FEELS}°C)"
echo "Humedad: ${HUMIDITY}%"
echo "Viento: ${WIND} km/h"
echo "Precipitación: ${PRECIP} mm"
