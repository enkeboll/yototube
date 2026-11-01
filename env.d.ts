declare global {
    type Env = {
        YOTO_AUTH_SECRET?: string
        YOTO_CLIENT_ID?: string
        RESEND_API_KEY?: string
        DATABASE_URL?: string
        GOOGLE_CLIENT_ID?: string
        GOOGLE_CLIENT_SECRET?: string
        SYNC_INTERVAL_MINUTES?: string
        PORT?: string
        NODE_ENV?: string
    }
}

export {}
