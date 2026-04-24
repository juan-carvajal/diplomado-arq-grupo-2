SHELL := /bin/bash
.PHONY: make1 make50

make1:
	curl http://localhost/hello

make16:
	@for i in {1..16}; do \
		curl -s -o /dev/null -w "%{http_code}\n" http://localhost/hello; \
	done

make50:
	@for i in {1..50}; do \
		curl -s -o /dev/null -w "%{http_code}\n" http://localhost/hello; \
	done

make50-summary:
	@for i in $$(seq 1 50); do \
		curl -s -o /dev/null -w "%{http_code}\n" http://localhost/hello; \
	done | sort | uniq -c