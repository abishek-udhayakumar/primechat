<?php
/**
 * PrimeChat — File Upload Handler
 * Secure file upload with validation, type checking, and unique naming
 */

class FileUpload {
    /**
     * Handle file upload
     * Returns file info array on success
     */
    public static function handle(array $file, string $uploadType = 'file'): array {
        // Validate upload
        if (!isset($file['error']) || is_array($file['error'])) {
            throw new \RuntimeException('Invalid file upload');
        }

        // Check for upload errors
        switch ($file['error']) {
            case UPLOAD_ERR_OK:
                break;
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                throw new \RuntimeException('File too large');
            case UPLOAD_ERR_NO_FILE:
                throw new \RuntimeException('No file uploaded');
            default:
                throw new \RuntimeException('Upload failed');
        }

        // Determine max size and allowed types based on upload type
        $maxSize = MAX_FILE_SIZE;
        $allowedTypes = ALLOWED_FILE_TYPES;
        $subDir = 'files';

        switch ($uploadType) {
            case 'image':
                $maxSize = MAX_IMAGE_SIZE;
                $allowedTypes = ALLOWED_IMAGE_TYPES;
                $subDir = 'images';
                break;
            case 'avatar':
                $maxSize = MAX_AVATAR_SIZE;
                $allowedTypes = ALLOWED_IMAGE_TYPES;
                $subDir = 'avatars';
                break;
            case 'voice':
                $maxSize = MAX_VOICE_SIZE;
                $allowedTypes = ALLOWED_VOICE_TYPES;
                $subDir = 'voice';
                break;
        }

        // Check file size
        if ($file['size'] > $maxSize) {
            throw new \RuntimeException('File exceeds maximum size of ' . self::formatSize($maxSize));
        }

        // Validate MIME type
        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']);

        if (!in_array($mimeType, $allowedTypes)) {
            throw new \RuntimeException('File type not allowed: ' . $mimeType);
        }

        // Generate unique filename
        $uniqueName = Sanitizer::generateUniqueFilename($file['name']);

        // Create upload directory if it doesn't exist
        $uploadDir = UPLOADS_PATH . '/' . $subDir;
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $filePath = $uploadDir . '/' . $uniqueName;
        $relativePath = 'uploads/' . $subDir . '/' . $uniqueName;

        // Move uploaded file
        if (!move_uploaded_file($file['tmp_name'], $filePath)) {
            throw new \RuntimeException('Failed to save file');
        }

        // Get image dimensions if applicable
        $width = null;
        $height = null;
        if (in_array($mimeType, ALLOWED_IMAGE_TYPES)) {
            $imageInfo = @getimagesize($filePath);
            if ($imageInfo) {
                $width = $imageInfo[0];
                $height = $imageInfo[1];
            }
        }

        return [
            'file_name' => Sanitizer::sanitizeFilename($file['name']),
            'file_path' => $relativePath,
            'file_type' => $mimeType,
            'file_size' => $file['size'],
            'width'     => $width,
            'height'    => $height,
            'duration'  => null,
        ];
    }

    /**
     * Format file size for display
     */
    public static function formatSize(int $bytes): string {
        $units = ['B', 'KB', 'MB', 'GB'];
        $i = 0;
        while ($bytes >= 1024 && $i < count($units) - 1) {
            $bytes /= 1024;
            $i++;
        }
        return round($bytes, 2) . ' ' . $units[$i];
    }

    /**
     * Delete a file from the uploads directory
     */
    public static function delete(string $relativePath): bool {
        $fullPath = PUBLIC_PATH . '/' . $relativePath;
        if (file_exists($fullPath)) {
            return unlink($fullPath);
        }
        return false;
    }
}
