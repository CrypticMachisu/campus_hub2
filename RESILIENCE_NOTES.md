# Week 11 - Resilience Lab Notes

## Part A: Reproducing Partner Failures

### Test Results

| Mode | Expected Behaviour | Actual Result |
|---|---|---|
| OK | Partner responds normally | Successful response received |
| Slow | Partner takes 10 seconds | Request took 10.024 seconds |
| Flaky | First two requests fail, third succeeds | Two 503 errors followed by a successful response |
| Error | Partner returns a server error | Received 500 Internal Server Error |

### Observations

The normal partner request returned data successfully.

The slow partner took approximately 10 seconds to respond, which could make users wait unnecessarily.

The flaky partner returned two 503 Service Unavailable errors before recovering on the third request.

The error mode consistently returned a 500 Internal Server Error.

### User Impact

Without resilience mechanisms, users may experience long waiting times, failed requests, and unavailable partner data. Temporary partner failures can interrupt access to important information. Users may become frustrated if the application does not respond promptly. A reliable application should handle these failures gracefully.