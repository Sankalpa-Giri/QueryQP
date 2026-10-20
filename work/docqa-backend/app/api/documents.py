from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse

from app.schemas.document import DocumentResponse
from app.services.document_service import create_document, get_document
from app.services.storage import uploaded_path

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
def upload_document(file: UploadFile = File(...)) -> DocumentResponse:
    """Save and synchronously process an uploaded PDF."""
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Phase 1 supports typed PDF files only.",
        )
    return create_document(file)


@router.get("/{document_id}", response_model=DocumentResponse)
def read_document(document_id: UUID) -> DocumentResponse:
    document = get_document(document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return document


@router.get("/{document_id}/file", response_class=FileResponse)
def read_document_file(document_id: UUID) -> FileResponse:
    document = get_document(document_id)
    path = uploaded_path(str(document_id))
    if document is None or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document file not found.")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=document.filename,
        content_disposition_type="inline",
    )


@router.get("/{document_id}/pages/{page_number}/image")
def read_document_page_image(document_id: UUID, page_number: int) -> Response:
    """Render a specific PDF page to a PNG image for bounding box overlay display."""
    import pymupdf
    from fastapi import Response

    document = get_document(document_id)
    path = uploaded_path(str(document_id))
    if document is None or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document file not found.")

    try:
        with pymupdf.open(path) as pdf:
            if page_number < 1 or page_number > len(pdf):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Page number out of range.")
            page = pdf[page_number - 1]
            # Render at 150 DPI for crisp readability while remaining lightweight
            pix = page.get_pixmap(dpi=150)
            png_bytes = pix.tobytes("png")
            return Response(content=png_bytes, media_type="image/png")
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to render page: {err}")

