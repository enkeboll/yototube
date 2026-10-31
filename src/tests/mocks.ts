const createMockEnv = (overrides: Partial<Env> = {}): Env => ({
    YOTO_AUTH_SECRET: "test-secret-key-for-testing",
    YOTO_CLIENT_ID: "test-client-id",
    RESEND_API_KEY: "test-resend-api-key",
    ...overrides,
})

export {createMockEnv}
