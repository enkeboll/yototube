import type {YotoSdk} from "@yotoplay/yoto-sdk"

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

    namespace App {
        // interface Error {}
        interface Locals {
            user?: {
                valid: boolean
                expiresIn?: string
                expiresAt?: number
            }
            sdk?: YotoSdk
            env: Env
        }
        // interface PageData {}
        // interface PageState {}
        // interface Platform {}
    }
}

export {}
