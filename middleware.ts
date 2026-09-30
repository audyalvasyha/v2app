import { NextResponse, type NextRequest } from "next/server"

/**
 * Rewriting subdomain untuk sub-app import SKR.
 *
 * skr.transportbaganbatu.com  →  /skr/input (halaman login + upload CSV)
 * transportbaganbatu.com / www / localhost → dashboard utama, tak tersentuh.
 *
 * Middleware ini tidak mengubah URL yang terlihat user: address bar tetap
 * skr.transportbaganbatu.com, sementara kontennya dari /skr/input.
 */
export function middleware(request: NextRequest) {
    const host = request.headers.get("host") ?? ""
    const bare = host.split(":")[0].toLowerCase() // buang port di dev

    if (bare === "skr.transportbaganbatu.com") {
        const { pathname, search } = request.nextUrl
        // Sudah di dalam /skr/* biarkan lewat (aset, dsb.)
        if (pathname.startsWith("/skr")) return NextResponse.next()

        const url = request.nextUrl.clone()
        url.pathname = `/skr/input${pathname === "/" ? "" : pathname}`
        url.search = search
        return NextResponse.rewrite(url)
    }

    return NextResponse.next()
}

export const config = {
    // Lewati aset statis & file internal Next.js
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|css|js|woff2?)$).*)"],
}
