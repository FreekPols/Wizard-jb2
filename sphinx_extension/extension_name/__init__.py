from __future__ import annotations

from pathlib import Path

from docutils import nodes

from sphinx.application import Sphinx
from sphinx.util.docutils import SphinxDirective, SphinxRole
from sphinx.util.typing import ExtensionMetadata


# From tutorial (to be removed)
class HelloRole(SphinxRole):
    """A role to say hello!"""
    def run(self) -> tuple[list[nodes.Node], list[nodes.system_message]]:
        node = nodes.inline(text=f'Hello {self.text}!')
        return [node], []


# From tutorial (to be removed)
class HelloDirective(SphinxDirective):
    """A directive to say hello!"""

    required_arguments = 1

    def run(self) -> list[nodes.Node]:
        paragraph_node = nodes.paragraph(text=f'hello {self.arguments[0]}!')
        return [paragraph_node]


def extension_name_static_path(app):
    # Get current dir
    init_py_dir = Path(__file__).parent.resolve()

    # Get _static dir
    _static_path = init_py_dir / "_static"

    # Add _static to the extension
    app.config.html_static_path.append(str(_static_path))


def setup(app: Sphinx) -> ExtensionMetadata:
    # Register the _static folder
    app.connect("builder-inited", extension_name_static_path)

    # From tutorial (to be removed)
    app.add_role('hello', HelloRole())
    app.add_directive('hello', HelloDirective)

    # Add the javascript for the navbar button
    app.add_js_file('edit_button.js', 1)

    # Basic information of the sphinx extension
    # Match with myproject.toml
    return {
        'version': '0.0.1',
        'parallel_read_safe': True,
        'parallel_write_safe': True,
    }
