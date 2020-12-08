all:
	@docker build --pull -t excalidraw .
	@docker login $(CONTAINER_REGISTRY_ENDPOINT) -u nologin -p $(SCW_SECRET_KEY)
	@docker tag excalidraw:latest $(CONTAINER_REGISTRY_ENDPOINT)/excalidraw:latest
	@docker push $(CONTAINER_REGISTRY_ENDPOINT)/excalidraw:latest
