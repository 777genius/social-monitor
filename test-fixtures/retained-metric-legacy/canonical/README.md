Fixed synthetic v1 corpus captured once using the pre-extraction executor at
ad58aae7ca3e7fda6c705ee2d91b25388a78b374 and the unchanged v1 admission/amendment
and canonical receipt implementation. These are disposable identities, not incident
or production receipts. The sequence-zero result uses the historical spelling
without manifestSha; amended results require the effective manifest SHA.

hashes.json pins every envelope's exact bytes and canonical payload SHA, including
both empty lock files. Tests load these bytes; they never regenerate expected hashes.
The existing differential old/new executor test independently checks freshly written
bytes. The two tests cover different risks.

Fixture budget: sequence-zero has 5 one-line JSON records and one empty lock;
amended has 7 one-line JSON records and one empty lock. These exact canonical bytes
are kept unformatted because whitespace changes envelope-byte authority. No blanket
source/test helper exclusion applies. This corpus does not replace activation's
independent validation of the actual entire incident predecessor directory.
