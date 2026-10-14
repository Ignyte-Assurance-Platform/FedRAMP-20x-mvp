# Writing acceptance criteria

- One bullet per behaviour: `- WHEN <trigger/state> THEN <observable result>`.
- Observable means testable from the outside: a screen state, a stored row, a response, a file, a log line.
- Cover: the happy path, each validation failure, each permission boundary, the empty state, and resume/retry where relevant.
- Non-functional limits (size, time, cost) are criteria too: `- WHEN a 100 MB file is uploaded THEN it completes without passing through the app server`.
