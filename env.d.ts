declare global {
    type Env = {
        YOTO_AUTH_SECRET: string
        YOTO_CLIENT_ID?: string
        RESEND_API_KEY?: string
        PORT?: string
        NODE_ENV?: string
    }
}

export {}
