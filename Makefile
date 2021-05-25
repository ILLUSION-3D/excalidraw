all:
	@docker build --pull -t excalidraw .

push:
	@test -z "$(VERSION)" && echo "Usage: VERSION=x.y.z make push" && exit 1 || true
	@docker login $(CONTAINER_REGISTRY_ENDPOINT) -u nologin -p $(SCW_SECRET_KEY)
	@docker tag excalidraw:latest $(CONTAINER_REGISTRY_ENDPOINT)/excalidraw:$(VERSION)
	@docker push $(CONTAINER_REGISTRY_ENDPOINT)/excalidraw:$(VERSION)
	@docker rmi $(CONTAINER_REGISTRY_ENDPOINT)/excalidraw:$(VERSION)
