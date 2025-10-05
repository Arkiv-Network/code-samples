import { Component, Input, inject } from "@angular/core" // Import Input
import { HttpClient, HttpClientModule } from "@angular/common/http"
import { CommonModule } from "@angular/common"

@Component({
    selector: "app-thumbnail-gallery",
    standalone: true,
    imports: [CommonModule, HttpClientModule],
    templateUrl: "./thumbnail-gallery.html",
    styleUrls: ["./thumbnail-gallery.css"],
})
export class ThumbnailGalleryComponent {
    private http = inject(HttpClient)

    // This is now an Input property. It receives its data from a parent component.
    @Input() ids: string[] = []

    public backendUrl = "http://localhost:3000"

    // The ngOnInit and fetchThumbnailIds methods have been removed,
    // as this component no longer fetches its own data.

    public onImageClick(thumbnailId: string): void {
        const apiUrl = `${this.backendUrl}/parent/${thumbnailId}`
        this.http.get(apiUrl, { responseType: "text" }).subscribe({
            next: (parentId) => {
                window.location.href = `${this.backendUrl}/image/${parentId}`
            },
            error: (err) => {
                console.error(
                    `Failed to fetch parent ID for thumbnail ${thumbnailId}:`,
                    err
                )
            },
        })
    }

    public onImageError(event: Event): void {
        const element = event.target as HTMLImageElement
        element.src = "https://placehold.co/100x100/eee/ccc?text=Error"
    }
}
