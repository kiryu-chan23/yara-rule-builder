// ============================================================
// Rule templates
// ============================================================
// Boilerplate to start from, one per common file type. Every template
// here was compiled against yara-x 1.19.0 before being added — a starter
// template that throws an error on load would be worse than no templates
// at all, since a new user would assume the tool is broken rather than
// the rule.
//
// Deliberately dependency-free: none of these `import pe` or `import elf`.
// The backend compiles with a bare yara_x.Compiler and no modules
// enabled, so a module import would fail to compile. Revisit if module
// support is added.

export const TEMPLATES = [
  {
    id: 'blank',
    label: 'Blank rule',
    source: `rule my_rule
{
    meta:
        author      = ""
        description = ""
        date        = ""

    strings:
        // yara-x rejects patterns shorter than 2 characters, so an empty
        // placeholder would fail to compile on load.
        $a = "example"

    condition:
        $a
}
`,
  },
  {
    id: 'pe',
    label: 'PE executable',
    source: `rule suspicious_pe
{
    meta:
        author      = ""
        description = "Windows PE with network and file-write imports"

    strings:
        // No $mz pattern: the uint16(0) check below tests the same magic
        // more cheaply, and yara-x errors on a pattern the condition
        // never references.
        $write_file  = "WriteFile" ascii
        $create_proc = "CreateProcessW" ascii wide
        $download    = "URLDownloadToFileW" ascii wide

    condition:
        // uint16(0) is the MZ magic; uint32 at 0x3C points at the PE header.
        uint16(0) == 0x5A4D
        and uint32(uint32(0x3C)) == 0x00004550
        and filesize < 5MB
        and 2 of ($write_file, $create_proc, $download)
}
`,
  },
  {
    id: 'elf',
    label: 'ELF binary',
    source: `rule suspicious_elf
{
    meta:
        author      = ""
        description = "Linux ELF touching shell and network syscall wrappers"

    strings:
        $shell   = "/bin/sh" ascii
        $bash    = "/bin/bash" ascii
        $socket  = "socket" ascii fullword
        $connect = "connect" ascii fullword

    condition:
        // 0x7F 'E' 'L' 'F'
        uint32(0) == 0x464C457F
        and filesize < 10MB
        and any of ($shell, $bash)
        and all of ($socket, $connect)
}
`,
  },
  {
    id: 'pdf',
    label: 'PDF document',
    source: `rule suspicious_pdf
{
    meta:
        author      = ""
        description = "PDF containing automatic actions or embedded script"

    strings:
        $header    = "%PDF-"
        $openaction = "/OpenAction" nocase
        $launch     = "/Launch" nocase
        $js         = "/JavaScript" nocase
        $embedded   = "/EmbeddedFile" nocase

    condition:
        $header at 0
        and filesize < 10MB
        and any of ($openaction, $launch, $js, $embedded)
}
`,
  },
  {
    id: 'ooxml',
    label: 'Office document',
    source: `rule suspicious_office_macro
{
    meta:
        author      = ""
        description = "OOXML or legacy Office file carrying VBA"

    strings:
        // OOXML files are ZIP archives: PK\\x03\\x04
        $zip     = { 50 4B 03 04 }
        // Legacy OLE compound file magic
        $ole     = { D0 CF 11 E0 A1 B1 1A E1 }
        $vba     = "vbaProject.bin" nocase
        $macros  = "Macros" nocase
        $autoopen = "AutoOpen" nocase
        $shell    = "Shell" ascii

    condition:
        ($zip at 0 or $ole at 0)
        and filesize < 5MB
        and any of ($vba, $macros)
        and any of ($autoopen, $shell)
}
`,
  },
];
