publish:
	npm config set @synapse-medicine:registry https://gitlab.com/api/v4/packages/npm/
	npm config set '//gitlab.com/api/v4/packages/npm/:_authToken' "${NPM_TOKEN}"
	npm config set '//gitlab.com/api/v4/projects/7004367/packages/npm/:_authToken' "${NPM_TOKEN}"
	npm publish
