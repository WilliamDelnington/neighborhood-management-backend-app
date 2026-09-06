import sanitizeHtml from "sanitize-html";

// Cho phep dinh dang co ban (in dam/nghieng/gach chan) va anh chen giua bai
// viet, dung cho News.content - xem RichTextEditor o admin-web-app va cac
// trang hien thi News o resident-web-app / mini app.
export function sanitizeRichContent(html: string): string {
    return sanitizeHtml(html, {
        allowedTags: ["p", "br", "strong", "em", "u", "b", "i", "img"],
        allowedAttributes: {
            img: ["src", "alt"],
        },
        allowedSchemesByTag: {
            img: ["http", "https"],
        },
    });
}
