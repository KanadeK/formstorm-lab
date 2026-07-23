# Release Checklist

- [ ] All quality gates pass on Node.js 22.
- [ ] Chromium is installed and all end-to-end paths pass.
- [ ] Core line coverage is at least 80 percent and critical modules target 90 percent.
- [ ] Three fixtures produce their expected validation and accessibility findings.
- [ ] Expected business rejection is not classified as a runtime crash.
- [ ] Demo output and README screenshot come from the release commit.
- [ ] Package smoke test passes in a clean temporary directory.
- [ ] `dist-release/SHA256SUMS.txt` matches every release asset.
- [ ] Secret and unfinished-marker scans are clean.
- [ ] Author and committer match the authenticated GitHub account.
- [ ] GitHub Actions, Pages, tag, and Release are green and public.
