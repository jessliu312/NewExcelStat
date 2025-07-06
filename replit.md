# Excel Processor Application

## Overview

This is a full-stack web application designed to process Excel warehouse shipping files. The application allows users to upload `.xlsx` files, processes them to extract warehouse data and calculate CTN (carton) summaries, and provides downloadable processed results. Built with a modern React frontend using shadcn/ui components and an Express.js backend with PostgreSQL database integration via Drizzle ORM.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for client-side routing
- **File Upload**: Native HTML5 file upload with drag-and-drop support

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **File Processing**: XLSX library for Excel file parsing and manipulation
- **File Upload**: Multer middleware for handling multipart/form-data
- **Validation**: Zod schemas for runtime type validation

### Database Design
The application uses a single table `processed_files` that tracks:
- File metadata (original and processed filenames, file size)
- Processing status (processing, completed, failed)
- Record counts and error messages
- Timestamps for created and updated dates

## Key Components

### File Upload System
- **Frontend**: Drag-and-drop interface with visual feedback and file validation
- **Backend**: Multer configuration with file size limits (10MB) and XLSX-only filtering
- **Encoding Handling**: Automatic detection and correction of filename encoding issues

### Processing Pipeline
- **Status Tracking**: Real-time status updates through polling mechanism
- **Error Handling**: Comprehensive error capture and user-friendly error messages
- **File Storage**: Temporary file storage in uploads directory during processing

### User Interface Components
- **FileUpload**: Drag-and-drop file upload with progress indication
- **ProcessingStatus**: Real-time status updates with visual progress indicators
- **ResultsDisplay**: Download interface for processed files
- **RecentFiles**: Historical view of processed files with download capabilities

## Data Flow

1. **File Upload**: User uploads Excel file via drag-and-drop or file picker
2. **Initial Processing**: Server creates database record with "processing" status
3. **Excel Processing**: Server parses Excel file and generates warehouse summaries
4. **Status Updates**: Frontend polls server for status updates every 2 seconds
5. **Completion**: Processed file becomes available for download
6. **Download**: User can download processed Excel file with warehouse summaries

## External Dependencies

### Database
- **Neon Database**: Serverless PostgreSQL database service
- **Connection**: Uses `@neondatabase/serverless` for database connectivity
- **Migrations**: Drizzle Kit for database schema management

### UI Components
- **Radix UI**: Comprehensive set of accessible UI primitives
- **Lucide React**: Icon library for consistent iconography
- **TanStack Query**: Server state management and caching

### Development Tools
- **Vite**: Fast development server and build tool with HMR support
- **TypeScript**: Type safety across the entire application
- **ESLint/Prettier**: Code formatting and linting (implied by modern React setup)

## Deployment Strategy

### Build Process
- **Frontend**: Vite builds React application to `dist/public`
- **Backend**: ESBuild bundles Express server to `dist/index.js`
- **Production**: Single Node.js process serves both static files and API

### Environment Configuration
- **Development**: Hot module replacement with Vite dev server
- **Production**: Express serves static files from dist directory
- **Database**: Environment variable `DATABASE_URL` for database connection

### File Management
- **Uploads**: Temporary storage in `uploads/` directory
- **Cleanup**: Processed files should be cleaned up (implementation pending)
- **Security**: File type validation and size limits for upload safety

## Changelog

```
Changelog:
- July 06, 2025. Initial setup
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```