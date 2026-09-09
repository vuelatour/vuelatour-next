"""Genera los fixtures de la hoja 1 con el armador REAL de pyservices.

Uso (desde vuelatour-next, con el .venv del repo hermano):
    npm run gen:hoja-fixture
  = ../vuelatour-pyservices/.venv/bin/python scripts/gen-hoja1-fixture.py

Por cada `src/components/admin/quotes/__fixtures__/<nombre>.payload.json`
(`CotizacionPdfRequest`) escribe `<nombre>.html` =
`_build_html(req, solo_hoja_1=True)` (la vista previa: misma hoja 1 que el
PDF, CSS de pantalla). El test `__tests__/quote-sheet.test.tsx` compara la
estructura (tags + clases) y el TEXTO impreso de `QuoteSheet` contra estos
HTML. Para que los fixtures se puedan versionar ligeros, el `<style>` (fuente
y CSS incrustados — el test de deriva ya los cubre) y los PNG en base64 se
sustituyen por un marcador; el marcado del cuerpo queda byte-idéntico.
"""

import json
import re
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
HERMANO = RAIZ.parent / "vuelatour-pyservices"
FIXTURES = RAIZ / "src" / "components" / "admin" / "quotes" / "__fixtures__"

_STYLE = re.compile(r"<style>.*?</style>", re.DOTALL)
_PNG = re.compile(r"data:image/png;base64,[A-Za-z0-9+/=]+")


def aligerar(html: str) -> str:
    html = _STYLE.sub("<style>/* CSS omitido: cotizacion-fuente.css + cotizacion-hoja.css + _estilos_pantalla */</style>", html)
    return _PNG.sub("data:image/png;base64,…", html)


def main() -> int:
    if not HERMANO.exists():
        print(f"No existe el repo hermano: {HERMANO}", file=sys.stderr)
        return 1
    sys.path.insert(0, str(HERMANO))
    from app.schemas.reportes import CotizacionPdfRequest  # noqa: E402
    from app.services.cotizacion_pdf import _build_html  # noqa: E402

    for payload_path in sorted(FIXTURES.glob("*.payload.json")):
        payload = json.loads(payload_path.read_text(encoding="utf-8"))
        html = aligerar(_build_html(CotizacionPdfRequest(**payload), solo_hoja_1=True))
        destino = payload_path.with_name(payload_path.name.replace(".payload.json", ".html"))
        destino.write_text(html, encoding="utf-8")
        print(f"{destino.relative_to(RAIZ)} ({len(html)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
