using BibleNote.Analytics.Services.VerseParsing.Contracts;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;

namespace BibleNote.Analytics.Services.VerseParsing
{
    public class TextNodeEntry
    {
        public IXmlNode Node { get; set; }

        internal string CleanedText { get; set; }

        public int StartIndex { get; set; }     // границы Node в TextNodesString.Value

        public int EndIndex { get; set; }

        public int Shift { get; set; }          // сдвиг из-за вставленных ссылок

        public bool WasCleaned { get; private set; }

        public void Clean()
        {
            Node.InnerXml = CleanedText;
            WasCleaned = true;
        }

        public void MoveBy(int shift)
        {
            StartIndex += shift;
            EndIndex += shift;
        }
    }

    public class TextNodesString
    {
        public string Value { get; set; }

        public List<TextNodeEntry> NodesInfo { get; set; }

        public bool IsReadonly { get; set; }

        public TextNodesString()
        {
            NodesInfo = new List<TextNodeEntry>();
        }
    }

    public class HtmlToTextConverter
    {
        private List<TextNodesString> _parseStrings;

        private static readonly Regex htmlPattern = new Regex(@"<(.|\n)*?>", RegexOptions.Compiled);             

        public string SimpleConvert(string htmlString)
        {
            if (string.IsNullOrEmpty(htmlString))
                return htmlString;

            return htmlPattern.Replace(htmlString, string.Empty);
        }

        public TextNodesString Convert(IXmlNode node)
        {
            _parseStrings = new List<TextNodesString>();

            if (node.NodeType == IXmlNodeType.Text)            
                AddParseString(BuildParseString(new[] { node }));            
            else
                FindParseStrings(node);

            var result = new TextNodesString();
            var sb = new StringBuilder();            
            var cursor = 0;            

            foreach (var textNodesString in _parseStrings)
            {
                if (cursor > 0)                
                    textNodesString.NodesInfo.ForEach(e => e.MoveBy(cursor));                

                sb.Append(textNodesString.Value);
                result.NodesInfo.AddRange(textNodesString.NodesInfo);
                cursor = sb.Length;
            }

            result.Value = sb.ToString();
            result.IsReadonly = node.IsReadonly;
            return result;
        }

        private void FindParseStrings(IXmlNode node)
        {
            if (!node.IsHierarchyNode(IXmlTextNodeMode.ElementWithTextNode))
            {
                AddParseString(BuildParseString(node.GetChildNodes()));
            }
            else
            {
                var nodes = new List<IXmlNode>();

                foreach (var childNode in node.GetChildNodes())
                {
                    if (childNode.IsTextNode(IXmlTextNodeMode.ElementWithTextNode))
                    {
                        nodes.Add(childNode);
                        continue;
                    }

                    if ((childNode.HasChildNodes() || childNode.Name == HtmlTags.Br) && nodes.Count > 0)
                    {
                        AddParseString(BuildParseString(nodes));
                        nodes.Clear();
                    }

                    if (childNode.HasChildNodes())
                        FindParseStrings(childNode);
                }

                if (nodes.Count > 0)
                    AddParseString(BuildParseString(nodes));
            }
        }

        private void AddParseString(TextNodesString parseString)
        {
            if (string.IsNullOrEmpty(parseString.Value))
                return;

            _parseStrings.Add(parseString);
        }

        private TextNodesString BuildParseString(IEnumerable<IXmlNode> nodes)
        {
            var result = new TextNodesString();
            var sb = new StringBuilder();

            foreach (var node in nodes)
            {
                var textNode = node.GetTextNode();
                if (string.IsNullOrEmpty(textNode.InnerXml))
                    continue;

                var nodeText = textNode.InnerXml.Replace(HtmlTags.Nbsp, " ");
                result.NodesInfo.Add(new TextNodeEntry()
                {
                    Node = textNode,
                    StartIndex = sb.Length,
                    EndIndex = sb.Length + nodeText.Length - 1,
                    CleanedText = nodeText
                });
                sb.Append(nodeText);
            }

            result.Value = sb.ToString();
            return result;
        }
    }
}
