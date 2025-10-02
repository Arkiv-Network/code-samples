import { Component, inject } from "@angular/core"
import { CommonModule } from "@angular/common"
import {
    HttpClient,
    HttpClientModule,
    HttpEventType,
    HttpResponse,
} from "@angular/common/http"
import { FormsModule } from "@angular/forms"

@Component({
    selector: "app-image-upload",
    standalone: true,
    imports: [CommonModule, FormsModule, HttpClientModule],
    templateUrl: "./image-upload.html",
    styleUrls: ["./image-upload.css"],
})
export class ImageUploadComponent {
    private http = inject(HttpClient)
    private backendUrl = "http://localhost:3000"

    // --- Form Data Properties ---
    public selectedFile: File | null = null
    public filename: string = ""
    public tags: string = "landscape, nature, sunset"
    // Use an array for custom tags for easier management
    public customAnnotations = [
        { key: "", value: "" },
        { key: "", value: "" },
        { key: "", value: "" },
    ]

    // --- UI State Properties ---
    public uploadProgress: number | null = null
    public uploadMessage: string | null = null
    public isError: boolean = false

    /**
     * Handles the file selection from the input element.
     * @param event The file input change event.
     */
    onFileSelected(event: Event): void {
        const element = event.target as HTMLInputElement
        if (element.files && element.files.length > 0) {
            this.selectedFile = element.files[0]
            this.uploadMessage = null // Clear previous messages
            this.uploadProgress = null
        }
    }

    /**
     * Constructs FormData and sends it to the backend on upload.
     */
    onUpload(): void {
        if (!this.selectedFile) {
            this.uploadMessage = "Please select a file to upload."
            this.isError = true
            return
        }

        this.uploadProgress = 0
        this.isError = false
        this.uploadMessage = null

        const formData = new FormData()
        formData.append("imageFile", this.selectedFile, this.selectedFile.name)

        // Append optional and required fields only if they have content
        if (this.filename.trim()) {
            formData.append("filename", this.filename.trim())
        }
        if (this.tags.trim()) {
            formData.append("tags", this.tags.trim())
        }

        // Append custom annotations that have both a key and a value
        this.customAnnotations.forEach((annotation, index) => {
            if (annotation.key.trim() && annotation.value.trim()) {
                formData.append(`custom_key${index + 1}`, annotation.key.trim())
                formData.append(
                    `custom_value${index + 1}`,
                    annotation.value.trim()
                )
            }
        })

        const apiUrl = `${this.backendUrl}/upload`

        this.http
            .post(apiUrl, formData, {
                reportProgress: true,
                observe: "events",
            })
            .subscribe({
                next: (event) => {
                    if (event.type === HttpEventType.UploadProgress) {
                        this.uploadProgress = Math.round(
                            100 * (event.loaded / (event.total || 1))
                        )
                    } else if (event instanceof HttpResponse) {
                        this.uploadMessage = "Upload successful!"
                        this.selectedFile = null // Clear file input after success
                    }
                },
                error: (err) => {
                    this.uploadMessage = "Upload failed. Please try again."
                    this.isError = true
                    this.uploadProgress = null
                    console.error("Upload error:", err)
                },
            })
    }
}
