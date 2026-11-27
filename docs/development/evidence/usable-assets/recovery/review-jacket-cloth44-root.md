# Rest-cloth review — high42 / low44

The repaired detailed cloth and its reduced counterpart are eligible inputs
for continued wearing work. This is **not final jacket acceptance**. Actual
avatar fit, the body/collar interface, details, motion and export are still
open. The previous high16/low29 zero-contact verdict remains withdrawn.

## Exact inputs and verification

The root reviewer checked every one of the 59 entries in the geometry
handoff manifest against the current file bytes and lengths: 46,262,859
bytes in total, with no mismatch. The manifest SHA-256 is
`e4e4f4c5fbc13a5a957879db254c88bfd18bb702f129424a590d47cf5f8e5e15`.

| Input | SHA-256 |
| --- | --- |
| Detailed high42 | `d390171806d787c21f98ca5a398117526d7cfc1f302c34bd46ea992ae28fcf0d` |
| Reduced low44 | `2abed15053c1521bb2ad103d19c9d715b488e7cfcb7b5f2f15c8dea79f61b803` |
| Body-only low41 diagnostic input | `6baae323b761025f62b0426b21bc37f4689bcb933d0486a8064af301542bd66b` |

The saved high and low audit reports record zero nonadjacent BVH candidates
for each individual body and collar object. Their closed-surface topology,
degeneracy and duplicate-facet checks also pass. These facts describe the
two objects separately at rest; they do not classify body/collar contacts
or prove clearance against the avatar.

The exact native files, both reviews, helper sources and selected images are
preserved in the [91-file rest-cloth checkpoint](https://chatgpt.com/library?file_id=libfile_b4c952a15ce08191b9921323a64c97e0&account_id=personal).
Its SHA-256 is `919f0fa1f3ad4d26a455a25559dbfb2583eae8f53cce2b2d5bd51863c0b5d5ee`.
The archive retains the root review as it stood immediately before this
delivery-link addendum; its original review bytes remain manifest-verified.

The reduced main cloth contains 37,468 body triangles and 22,708 collar
triangles. Adding the author's current 57,814 secondary triangles gives a
forecast of 117,990, leaving 7,010 under the fixed 125,000 whole-jacket
budget. This forecast must be measured again after actual assembly.

The saved, bidirectional all-vertex/all-triangle-centroid comparison checks
outer surface, inner surface and rim separately. Its maximum is 0.319266 mm
for the body and 0.954472 mm for the collar, within the unchanged 1.5 mm
budget. The collar rim produces that maximum. This finite sampling is not
a continuous Hausdorff bound.

## Visual observations

The root reviewer actually viewed seven saved images: isolated before/after
side views of the lapel endpoint, matched high/low whole-front images,
matched high/low collar-front images and the low nape image. These are
diagnostic cloth renders, without the final avatar and secondary details.

The isolated side comparison shows the erroneous long backward endpoint
strip in the old model and its removal in high42. The corrected front edge
retains its downward reach to the waist. The matching high/low images keep
the same overall silhouette, collar opening, lapel returns and cuff
outline at the inspected views. The nape remains a continuous standing
collar. These images do not establish final piping attachment or wearing
clearance, and they do not replace the numeric surface comparison.

The endpoint repair is explicitly a source-defect correction, not a
reduction approximation: six original cage rows jumped about 145 mm from
the front toward the back. The maximum evaluated exterior correction is
138.482 mm. Original coordinates, source bytes and the corrected values
remain in the provenance. The 1.5 mm approximation test compares low44 to
the repaired high42, not to the defective old strip.

## Still-open failures and scope

The body41 Cartesian dual-quaternion diagnostic has zero shell contacts at
frame 1 but 58 at frame 49, with 12 nonpositive projected-thickness faces.
The angular-binding alternative is worse: 1,365 contacts and 177
nonpositive faces at frame 49. Both are failed motion diagnostics, retained
without accepting either result. A separate coherent regional rest fit is
shell-clean but initially retained 305 shirt triangle contacts; it is also
a partial diagnostic, not a worn-jacket pass.

The author must resolve actual shirt/body/vest clearance, source-mapped
body/collar interface defects, paired-shell motion, all 98 secondary
parts, and native/export correspondence before final engine and installed
package validation. The existing 30/37 project checklist remains unchanged.

This root review reads saved reports and visually inspects the stated
images. The separate reviewer has now completed an actual Blender reload
and independent padded-BVH/SAT and topology audit of all four exact shells,
confirming the bounded rest result and all 59 manifest identities. See the
[independent review](review-jacket-high42-low44.md) for that distinct run,
its command, source hash, observations and visual scope. It grants no
acceptance to the author's separate later regional-fit candidates.
