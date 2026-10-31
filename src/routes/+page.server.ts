import {redirect} from "@sveltejs/kit"

import type {PageServerLoad} from "./$types"

export const load: PageServerLoad = async ({locals}) => {
    if (locals.user?.valid) {
        throw redirect(302, "/cards")
    }
    return {}
}
