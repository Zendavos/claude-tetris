---
name: weather
description: Obtiene el clima actual localmente vía APIs gratuitas (sin API key), usando ubicación por IP, nombre de ciudad, o coordenadas. Usar cuando el usuario pida el clima, temperatura, pronóstico o condiciones meteorológicas.
---

# Weather

Obtiene el clima actual ejecutando `scripts/get-weather.sh`, que usa:
- **ipapi.co** para geolocalizar por IP (sin ciudad especificada).
- **geocoding-api.open-meteo.com** para resolver nombre de ciudad a coordenadas.
- **api.open-meteo.com** para el pronóstico actual (temperatura, sensación térmica, humedad, viento, precipitación, condición).

Ninguna API requiere clave. Requiere `curl` y `bash` (Git Bash en Windows).

## Uso

```bash
# Clima en la ubicación detectada por IP
bash .claude/skills/weather/scripts/get-weather.sh

# Clima en una ciudad
bash .claude/skills/weather/scripts/get-weather.sh "Buenos Aires"

# Clima en coordenadas exactas
bash .claude/skills/weather/scripts/get-weather.sh 40.4168 -3.7038
```

El script imprime: ubicación, condición, temperatura, sensación térmica, humedad, viento y precipitación.

Ejecutar el script y reportar el resultado al usuario en su idioma; no reformatear los datos salvo que se pida.
