import {describe, expect, it} from "vitest"

import {
    extractKeywordsFromTrack,
    pickUniqueYotoIconsForTracks,
    scoreIconsAgainstKeywords,
} from "./icon-suggest.server"
import {parseYotoEverythingIconsFromHtml} from "./yotoeverything-icons.server"

describe("parseYotoEverythingIconsFromHtml", () => {
    it("extracts icons and their prompts from yotoeverything RSC HTML", () => {
        const sampleHtml = `
            <script>self.__next_f.push([1,"{\\"slug\\":\\"squirrel\\",\\"title\\":\\"Squirrel\\",\\"category\\":\\"animals\\",\\"topic\\":\\"autumn\\",\\"prompt\\":\\"Autumn red squirrel, side view, bushy tail, holding a nut\\",\\"colours\\":6}"])</script>
        `
        const icons = parseYotoEverythingIconsFromHtml(sampleHtml)
        expect(icons).toHaveLength(1)
        expect(icons[0]).toMatchObject({
            id: "squirrel",
            title: "Squirrel",
            category: "animals",
            topic: "autumn",
            url: "https://www.yotoeverything.com/icons/squirrel.png",
        })
        expect(icons[0].tags).toContain("squirrel")
        expect(icons[0].tags).toContain("autumn")
    })
})

describe("icon-suggest.server", () => {
    it("extracts keywords and expands kid-friendly theme synonyms from title and tags", () => {
        const keywords = extractKeywordsFromTrack({
            title: "Twinkle Twinkle Little Lullaby (Official Lyric Video)",
            artist: "Super Simple Songs - Topic",
            tags: ["bedtime", "dino"],
        })

        const kwList = keywords.map(k => k.keyword)
        expect(kwList).toContain("twinkle")
        expect(kwList).toContain("lullaby")
        expect(kwList).toContain("star")
        expect(kwList).toContain("moon")
        expect(kwList).toContain("dinosaur")
        expect(kwList).not.toContain("official")
        expect(kwList).not.toContain("video")
    })

    it("scores and ranks icons across Yoto Official, Yoto Everything, and Community libraries", () => {
        const keywords = extractKeywordsFromTrack({
            title: "Choo Choo Train Adventure",
        })

        const ranked = scoreIconsAgainstKeywords(
            keywords,
            [
                {
                    id: "yoto-1",
                    title: "Steam Train",
                    tags: ["train", "vehicle"],
                    url: "https://yoto/train.png",
                },
            ],
            [
                {
                    id: "train-side",
                    title: "Train side",
                    category: "vehicles",
                    topic: "train",
                    prompt: "Red locomotive train on tracks",
                    tags: ["vehicles", "train", "locomotive"],
                    url: "https://www.yotoeverything.com/icons/train-side.png",
                },
                {
                    id: "apple",
                    title: "Apple",
                    category: "food",
                    topic: "apple",
                    prompt: "Red apple",
                    tags: ["food", "apple"],
                    url: "https://www.yotoeverything.com/icons/apple.png",
                },
            ],
            [],
        )

        expect(ranked.length).toBeGreaterThanOrEqual(2)
        expect(ranked[0].matchedKeyword).toBe("train")
        expect(ranked.some(r => r.id === "apple")).toBe(false)
    })

    it("always picks a unique icon for every imported track without repeating icons already on the card", () => {
        const yotoIcons = [
            {
                id: "icon-whale",
                title: "Whale",
                tags: ["whale", "ocean", "sea"],
                url: "https://yoto/whale.png",
            },
            {
                id: "icon-star",
                title: "Star",
                tags: ["star", "night"],
                url: "https://yoto/star.png",
            },
            {
                id: "icon-rocket",
                title: "Rocket",
                tags: ["rocket", "space"],
                url: "https://yoto/rocket.png",
            },
            {
                id: "icon-apple",
                title: "Apple",
                tags: ["apple", "fruit"],
                url: "https://yoto/apple.png",
            },
        ]

        const alreadyUsed = new Set(["icon-whale"])
        const tracks = [
            {title: "Baby Beluga", artist: "Raffi", tags: ["whale"]},
            {title: "Completely Unrelated Song X1", artist: "Artist A"},
            {title: "Completely Unrelated Song X2", artist: "Artist B"},
        ]

        const picked = pickUniqueYotoIconsForTracks(
            yotoIcons,
            tracks,
            alreadyUsed,
        )

        expect(picked).toHaveLength(3)
        // Must pick an icon for every track even when keywords don't match
        expect(picked.every(id => typeof id === "string" && id.length > 0)).toBe(
            true,
        )
        // Must not reuse "icon-whale" which was already on the card
        expect(picked).not.toContain("icon-whale")
        // All 3 picked icons must be distinct
        expect(new Set(picked).size).toBe(3)
    })
})

