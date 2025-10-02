import { Component, inject } from "@angular/core"
import { CommonModule } from "@angular/common"
import { HttpClient, HttpClientModule } from "@angular/common/http"
import { FormsModule } from "@angular/forms" // Import FormsModule for ngModel
import { ThumbnailGalleryComponent } from "../thumbnail-gallery/thumbnail-gallery" // Import the gallery component

@Component({
    selector: "app-image-search",
    standalone: true,
    // Import everything this component needs to function
    imports: [
        CommonModule,
        FormsModule,
        HttpClientModule,
        ThumbnailGalleryComponent,
    ],
    templateUrl: "./image-search.html",
    styleUrls: ["./image-search.css"],
})
export class ImageSearchComponent {
    private http = inject(HttpClient)
    private backendUrl = "http://localhost:3000"

    // Holds the value from the text input box
    public searchTag: string = ""
    // Holds the array of IDs returned from the search API call
    public searchResultIds: string[] = []
    // Tracks the state to show messages to the user
    public searchPerformed = false

    /**
     * Called when the user clicks the search button.
     */
    public onSearch(): void {
        this.searchPerformed = true
        this.searchResultIds = [] // Clear previous results

        if (!this.searchTag || !this.searchTag.trim()) {
            console.log("Search tag is empty.")
            return
        }

        const tag = this.searchTag.trim()
        const apiUrl = `${this.backendUrl}/query/${tag}`
        console.log(`Querying for tag: ${tag}`)

        this.http.get<string[]>(apiUrl).subscribe({
            next: (ids) => {
                this.searchResultIds = ids
                console.log(`Found ${ids.length} results for tag "${tag}".`)
            },
            error: (err) => {
                console.error(`Error searching for tag "${tag}":`, err)
            },
        })
    }
}
