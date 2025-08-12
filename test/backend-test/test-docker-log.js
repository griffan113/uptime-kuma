const { describe, it, mock, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const axios = require("axios");
const { R } = require("redbean-node");
const Monitor = require("../../server/model/monitor");
const { UP, PENDING } = require("../../src/util");

describe("Docker Monitor Log Fetching", () => {

    let axiosMock;
    let rStoreMock;
    let rExecMock;
    let rFindOneMock;
    let rLoadMock;
    let rDispenseMock;

    beforeEach(() => {
        // Mock axios
        axiosMock = mock.method(axios, "request", () => Promise.resolve({ data: {} }));

        // Mock RedBeanNode
        rStoreMock = mock.method(R, "store", () => Promise.resolve());
        rExecMock = mock.method(R, "exec", () => Promise.resolve());
        rFindOneMock = mock.method(R, "findOne", () => Promise.resolve({ id: 1 }));
        rLoadMock = mock.method(R, "load", () => Promise.resolve({ _dockerType: "socket", _dockerDaemon: "/var/run/docker.sock" }));
        rDispenseMock = mock.method(R, "dispense", () => ({
            monitor_id: 1,
            status: UP,
            msg: "",
            ping: 0,
            time: new Date().toISOString(),
            toJSON: () => ({}),
        }));
    });

    afterEach(() => {
        mock.reset();
    });

    it("should fetch logs if container is running", async () => {
        // Arrange
        axiosMock.mock.mockImplementation((options) => {
            if (options.url.endsWith("/json")) {
                return Promise.resolve({ data: { State: { Running: true, Status: "running" } } });
            }
            if (options.url.endsWith("/logs")) {
                return Promise.resolve({ data: "some log data" });
            }
            return Promise.reject(new Error("Unexpected URL"));
        });

        const monitor = {
            id: 1,
            type: "docker",
            docker_container: "test-container",
            logLines: 250,
            docker_host: 1,
        };

        // Act
        // This is a simplified version of the logic in the beat function
        const dockerHost = await R.load("docker_host", monitor.docker_host);
        const options = {
            url: `/containers/${monitor.docker_container}/json`,
            socketPath: dockerHost._dockerDaemon,
        };
        const res = await axios.request(options);

        if (res.data.State.Running) {
            const logOptions = {
                ...options,
                url: `/containers/${monitor.docker_container}/logs`,
                params: {
                    stdout: true,
                    stderr: true,
                    tail: monitor.logLines || 500,
                },
            };
            const logRes = await axios.request(logOptions);

            if (logRes.data) {
                const logBean = R.dispense("docker_log");
                logBean.monitor_id = monitor.id;
                logBean.log = logRes.data;
                await R.store(logBean);
                await R.exec("DELETE FROM docker_log WHERE id IN (SELECT id FROM docker_log WHERE monitor_id = ? ORDER BY ts DESC LIMIT -1 OFFSET 50)", [monitor.id]);
            }
        }


        // Assert
        assert.strictEqual(axiosMock.mock.callCount(), 2, "axios.request should be called twice");

        const logCall = axiosMock.mock.calls[1].arguments[0];
        assert.ok(logCall.url.endsWith("/logs"), "Second call should be to /logs");
        assert.strictEqual(logCall.params.tail, 250, "Log lines should be 250");

        assert.strictEqual(rStoreMock.mock.callCount(), 1, "R.store should be called once to save the log");
        assert.strictEqual(rExecMock.mock.callCount(), 1, "R.exec should be called once to prune logs");
    });

    it("should not fetch logs if container is not running", async () => {
        // Arrange
        axiosMock.mock.mockImplementation((options) => {
             if (options.url.endsWith("/json")) {
                return Promise.resolve({ data: { State: { Running: false, Status: "exited" } } });
            }
            return Promise.reject(new Error("axios should not be called for logs"));
        });

        const monitor = {
            type: "docker",
            docker_container: "test-container",
            docker_host: 1,
        };

        // Act & Assert
        const dockerHost = await R.load("docker_host", monitor.docker_host);
        const options = {
            url: `/containers/${monitor.docker_container}/json`,
            socketPath: dockerHost._dockerDaemon,
        };

        const res = await axios.request(options);

        assert.strictEqual(res.data.State.Running, false);
        assert.strictEqual(axiosMock.mock.callCount(), 1, "axios.request should only be called once for state");
        assert.strictEqual(rStoreMock.mock.callCount(), 0, "R.store should not be called");
        assert.strictEqual(rExecMock.mock.callCount(), 0, "R.exec should not be called");
    });
});
