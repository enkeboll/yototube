declare global {
    type Env = {
        YOTO_AUTH_SECRET: string
        RESEND_API_KEY?: string
        PORT?: string
        NODE_ENV?: string
    }
}

export {}
