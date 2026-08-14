#!/usr/bin/env bash
# =============================================================================
# Nachpflege von Aufgaben — Zuweisen, Prüf-Status, Verknüpfen.
#
# Run auf dem VPS. Reicht alle Argumente an infra/mcp-taskcare.mjs durch, das
# im Produktions-Container läuft (dort liegt der Prisma-Client).
#
#   bash infra/mcp-taskcare.sh --assign --assign-to claude
#   bash infra/mcp-taskcare.sh --review --keys "TOF-0119,TOF-0120"
#   bash infra/mcp-taskcare.sh --link --links "TOF-0013:DependsOn:TOF-0014"
#   bash infra/mcp-taskcare.sh --resume-prompt        # TOF-0000 aus der Doku erneuern
#
# Warum nicht über die MCP: POST /api/mcp kennt weder ein Zuweisungsfeld in
# update_task noch Verknüpfungen noch die Scrum-Spalte. Solange das so ist,
# ist dieser Weg der ehrliche — er schreibt mit denselben Prisma-Modellen wie
# die Anwendung, nicht an ihr vorbei.
# =============================================================================
set -euo pipefail

SERVICE="${SERVICE:-task-tracker}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER="${WORKER:-$HERE/mcp-taskcare.mjs}"

fail() { printf '\n\033[1;31m✖ %s\033[0m\n\n' "$*" >&2; exit 1; }

[ -f "$WORKER" ] || fail "Skript nicht gefunden: $WORKER"
docker inspect -f '{{.State.Running}}' "$SERVICE" 2>/dev/null | grep -qx true \
  || fail "Container '$SERVICE' läuft nicht"

# Muss nach /app: Node sucht node_modules vom Skript aus aufwärts.
docker cp "$WORKER" "$SERVICE:/app/.mcp-taskcare.mjs" >/dev/null

# --resume-prompt liest die Doku-Datei; die liegt auf dem Host, nicht im Image.
PROMPT_DOC="${PROMPT_DOC:-$HERE/../docs/WIEDERAUFNAHME-PROMPT.md}"
case " $* " in
  *" --resume-prompt "*)
    [ -f "$PROMPT_DOC" ] || fail "Wiederaufnahme-Prompt nicht gefunden: $PROMPT_DOC"
    docker cp "$PROMPT_DOC" "$SERVICE:/app/.wiederaufnahme.md" >/dev/null
    ;;
esac

docker exec "$SERVICE" node /app/.mcp-taskcare.mjs "$@"
docker exec -u 0 "$SERVICE" rm -f /app/.mcp-taskcare.mjs /app/.wiederaufnahme.md 2>/dev/null || true
