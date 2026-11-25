# Nekudot — build & packaging helpers
#
#   make            # build the extension and produce a clean, upload-ready dist.zip
#   make build      # parcel build + copy assets into dist/
#   make zip        # (re)build, then package dist/ into dist.zip for the Web Store
#   make test       # run the unit tests
#   make clean      # remove dist/, dist.zip, and the parcel cache

SHELL := /bin/bash
DIST  := dist
ZIP   := dist.zip

.PHONY: all build zip test clean

all: zip

build:
	npm run build

# Web Store upload zip. Two things the store cares about, both handled here:
#   1. manifest.json must be at the ROOT of the archive (so we zip the *contents*
#      of dist/, not the dist/ folder itself).
#   2. no macOS cruft — __MACOSX, .DS_Store, ._* resource forks — which the store
#      warns on. The `zip` CLI (unlike Finder/ditto) adds no __MACOSX, `-X` drops
#      resource forks, and the -x globs skip any dotfiles.
zip: build
	rm -f $(ZIP)
	find $(DIST) -name '.DS_Store' -delete
	cd $(DIST) && zip -r -X ../$(ZIP) . -x '.*' -x '*/.*' >/dev/null
	@echo "Packaged $(ZIP) (v$$(node -p "require('./manifest.json').version"))"
	@if unzip -l $(ZIP) | grep -qE '__MACOSX|\.DS_Store|/\._'; then \
		echo "  ERROR: cruft found in $(ZIP)"; exit 1; \
	else \
		echo "  clean, manifest.json at archive root"; \
	fi

test:
	npm test

clean:
	rm -rf $(DIST) $(ZIP) .parcel-cache
