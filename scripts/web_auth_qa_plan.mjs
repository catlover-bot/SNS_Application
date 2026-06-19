#!/usr/bin/env node

const sections = [
  {
    title: "0. Before the session",
    items: [
      "Run pnpm check:web-env and confirm required Supabase variables are present.",
      "Start the Web dev server with pnpm dev:web.",
      "Run pnpm smoke:web from the same Windows/WSL environment that can reach the server.",
      "Prepare one or two test accounts without committing credentials.",
    ],
  },
  {
    title: "1. Sign in and create demo data",
    items: [
      "Sign in through /login.",
      "Open /compose and create the first post.",
      "Create 3-5 total posts from user A with varied topics and tones.",
      "Optionally sign in as user B and create 1-2 posts.",
      "Reply from B to one A post, then reload the post detail page.",
    ],
  },
  {
    title: "2. Core authenticated flows",
    items: [
      "Save/bookmark one post and verify /saved.",
      "Search for a word from a demo post and inspect /trending.",
      "Update display name, bio, handle, and optional avatar in /settings/profile.",
      "Check /notifications empty, unread, and mark-read states when data exists.",
      "Check /following and follow/unfollow if profiles expose the control.",
      "Open /messages, then a conversation if one exists, and send one DM.",
    ],
  },
  {
    title: "3. Persona story",
    items: [
      "Open /dashboard/persona and confirm persona summary/radar/evolution modules.",
      "Open /persona-feed and switch available feed modes.",
      "Open /persona-evolution and confirm the timeline reflects enough posting activity or guides the user back to posting.",
      "Open /persona-lab and inspect compatibility/prompts without exposing provider secrets.",
      "Open /personas and one /personas/[key] detail page.",
    ],
  },
  {
    title: "4. Access-control checks",
    items: [
      "Use a logged-out/private session for /compose and confirm redirect to /login?next=...",
      "Open /saved logged out and confirm it is gated.",
      "Open /dashboard/ab-timeseries without admin/dev access and confirm it is not public.",
      "Open /api/me/timeline-signals logged out and confirm only a sanitized error is returned.",
    ],
  },
  {
    title: "5. Record notes",
    items: [
      "Record pass/fail per flow without copying .env files, passwords, cookies, tokens, raw SQL errors, stack traces, or internal IDs.",
      "Capture screenshots only after checking that no secret browser/plugin/devtool panel is visible.",
      "End by rerunning pnpm smoke:web to confirm credential-free checks still pass.",
    ],
  },
];

console.log("Web authenticated QA manual plan");
console.log("This script does not log in, read credentials, or contact Supabase.\n");

for (const section of sections) {
  console.log(section.title);
  section.items.forEach((item) => console.log(`- [ ] ${item}`));
  console.log("");
}
