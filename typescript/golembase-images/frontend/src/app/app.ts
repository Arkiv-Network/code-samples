import { Component, OnInit, signal, inject } from "@angular/core"
import { CommonModule } from "@angular/common"
import { HttpClient, HttpClientModule } from "@angular/common/http"
import { RouterOutlet } from "@angular/router"
import { ThumbnailGalleryComponent } from "./thumbnail-gallery/thumbnail-gallery"
import { ImageSearchComponent } from "./image-search/image-search"
import { ImageUploadComponent } from "./image-upload/image-upload"

@Component({
    selector: "app-root",
    standalone: true,
    imports: [
        CommonModule,
        RouterOutlet,
        HttpClientModule,
        ImageSearchComponent,
        ImageUploadComponent,
        ThumbnailGalleryComponent, // Make sure ThumbnailGalleryComponent is imported
    ],
    templateUrl: "./app.html",
    styleUrl: "./app.css",
})
export class App implements OnInit {
    private http = inject(HttpClient)
    private backendUrl = "http://localhost:3000"

    protected readonly title = signal("frontend")
    public allThumbnailIds: string[] = []

    ngOnInit(): void {
        this.fetchInitialThumbnails()
    }

    /**
     * Fetches the initial list of all thumbnails to display on page load.
     */
    fetchInitialThumbnails(): void {
        const apiUrl = `${this.backendUrl}/thumbnails`
        console.log("Fetching initial thumbnails...")

        this.http.get<string[]>(apiUrl).subscribe({
            next: (ids) => {
                this.allThumbnailIds = ids
                console.log(
                    `Successfully fetched ${ids.length} initial thumbnail IDs.`
                )
            },
            error: (err) => {
                console.error("Failed to fetch initial thumbnails:", err)
            },
        })
    }
}
