"""Tests for the GROBID TEI/XML parser."""

from grading_system_src.ingest.grobid_client import _parse_tei
from grading_system_src.models import Language


SAMPLE_TEI = """\
<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Test Paper Title</title>
      </titleStmt>
    </fileDesc>
    <profileDesc>
      <abstract>
        <p>This is the abstract of the test paper.</p>
      </abstract>
    </profileDesc>
  </teiHeader>
  <text>
    <body>
      <div>
        <head n="1">Introduction</head>
        <p>This is the introduction. Some claim here <ref type="bibr" target="#b0">(Smith, 2020)</ref>.</p>
      </div>
      <div>
        <head n="2">Methods</head>
        <p>We used various methods.</p>
      </div>
    </body>
    <back>
      <listBibl>
        <biblStruct xml:id="b0">
          <analytic>
            <title>Sea level rise impacts</title>
            <author>
              <persName>
                <forename>John</forename>
                <surname>Smith</surname>
              </persName>
            </author>
          </analytic>
          <monogr>
            <imprint>
              <date when="2020"/>
            </imprint>
          </monogr>
          <idno type="DOI">10.1234/test</idno>
        </biblStruct>
      </listBibl>
    </back>
  </text>
</TEI>
"""


def test_parse_tei_title() -> None:
    ms = _parse_tei(SAMPLE_TEI, source_path="test.pdf", language=Language.EN)
    assert ms.title == "Test Paper Title"


def test_parse_tei_abstract() -> None:
    ms = _parse_tei(SAMPLE_TEI, source_path="test.pdf", language=Language.EN)
    assert "abstract" in ms.abstract.lower()


def test_parse_tei_sections() -> None:
    ms = _parse_tei(SAMPLE_TEI, source_path="test.pdf", language=Language.EN)
    assert len(ms.sections) == 2
    assert ms.sections[0].heading == "Introduction"
    assert ms.sections[1].heading == "Methods"


def test_parse_tei_references() -> None:
    ms = _parse_tei(SAMPLE_TEI, source_path="test.pdf", language=Language.EN)
    assert len(ms.references) == 1
    assert ms.references[0].title == "Sea level rise impacts"
    assert ms.references[0].authors == ["John Smith"]
    assert ms.references[0].year == 2020
    assert ms.references[0].doi == "10.1234/test"


def test_parse_tei_inline_citations() -> None:
    ms = _parse_tei(SAMPLE_TEI, source_path="test.pdf", language=Language.EN)
    assert "b0" in ms.inline_citations
