Unit test runner for NativeScript
=================================

Refer to the documentation of NativeScript CLI's `ns test init` command for usage.

If you encounter an issue, please log it at https://github.com/NativeScript/nativescript-cli/

### Troubleshooting

If you see an error like this:

```
Error: connect ECONNREFUSED ::1:9876
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1195:16)
```

When using node 17 or higher, make sure your `karma.conf.js` contains a server hostname setting, for example:

```
// web server hostname (ensure this is present)
hostname: '127.0.0.1',

// web server port
port: 9876,
```
See [here](https://github.com/NativeScript/nativescript-cli/commit/81cb9c37cdd4e24115be79b24b68dfbaf8cdcfd2) for changeset in CLI which adds that to all newly initialized unit test setups.
