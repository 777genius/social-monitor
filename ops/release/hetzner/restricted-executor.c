/* Build only with -static. No dynamic loader or shell runs on the SSH boundary. */
#define _GNU_SOURCE
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static const char forced[] = "/usr/bin/sudo -n /opt/social-monitor-release/root-executor";
static const char path[] = "/usr/sbin:/usr/bin:/sbin:/bin";

int main(int argc, char **argv) {
    char original[513];
    const char *command = getenv("SSH_ORIGINAL_COMMAND");
    if (!command || strnlen(command, sizeof(original)) >= sizeof(original)) return 126;
    memcpy(original, command, strlen(command) + 1);
    int root = getuid() == 0 && geteuid() == 0;
    if (root) {
        if (argc != 1) return 126;
    } else {
        if (getuid() != geteuid() || argc != 3 || strcmp(argv[1], "-c") ||
            strcmp(argv[2], forced)) return 126;
    }
    if (clearenv() || setenv("PATH", path, 1) || setenv("LC_ALL", "C", 1) ||
        setenv("SSH_ORIGINAL_COMMAND", original, 1)) return 126;
    if (root) {
        char *args[] = {"/opt/social-monitor-release-python/bin/python3", "-I", "-B",
            "/opt/social-monitor-release/controller.py", NULL};
        execv(args[0], args);
    } else {
        char *args[] = {"/usr/bin/sudo", "-n", "/opt/social-monitor-release/root-executor", NULL};
        execv(args[0], args);
    }
    return 127; /* Fixed program unavailable; no raw errno/command/environment output. */
}
