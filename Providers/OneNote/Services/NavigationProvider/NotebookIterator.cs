using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Microsoft.Office.Interop.OneNote;
using System.Xml;
using System.Xml.Linq;
using System.Xml.XPath;
using BibleNote.Common.Exceptions;

namespace BibleNote.Analytics.Providers.OneNote.Services.NavigationProvider
{
    public class NotebookIterator
    {
        public class HierarchyElementInfo
        {
            public string Id { get; set; }
            public string Title { get; set; }
        }

        public class SectionGroupInfo : HierarchyElementInfo
        {
            public List<SectionGroupInfo> SectionGroups { get; set; }
            public List<SectionInfo> Sections { get; set; }

            public SectionGroupInfo()
            {
                this.SectionGroups = new List<SectionGroupInfo>();
                this.Sections = new List<SectionInfo>();
            }
        }


        public class NotebookInfo : HierarchyElementInfo
        {
            public int PagesCount { get; set; }
            public SectionGroupInfo RootSectionGroup { get; set; }
        }

        public class SectionInfo : HierarchyElementInfo
        {
            public List<PageInfo> Pages { get; set; }

            public SectionInfo()
            {
                this.Pages = new List<PageInfo>();
            }
        }

        public class PageInfo : HierarchyElementInfo
        {
            public string NotebookId { get; set; }
            public string SectionGroupId { get; set; }
            public string SectionId { get; set; }
            public XElement PageElement { get; set; }
            public XmlNamespaceManager Xnm { get; set; }
        }

        public NotebookIterator()
        {

        }

        public NotebookInfo GetSectionGroupOrNotebookPages(ref Application oneNoteApp, string notebookId, string sectionGroupId, Func<PageInfo, bool> filter)
        {
            var notebookElement = ApplicationCache.Instance.GetHierarchy(ref oneNoteApp, notebookId, HierarchyScope.hsPages);

            var sectionGroup = string.IsNullOrEmpty(sectionGroupId)
                                        ? notebookElement.Content.Root
                                        : notebookElement.Content.Root.XPathSelectElement(
                                                string.Format("//one:SectionGroup[@ID=\"{0}\"]", sectionGroupId), notebookElement.Xnm);

            if (sectionGroup == null)
                throw new NotFoundException($"notebookId = '{notebookId}', sectionGroupId = '{sectionGroupId}'");

            int pagesCount = 0;
            var rootSectionGroup = ProcessSectionGroup(sectionGroup, notebookId, notebookElement.Xnm, filter, ref pagesCount);

            var result = new NotebookInfo()
            {
                RootSectionGroup = rootSectionGroup,
                PagesCount = pagesCount
            };

            ProcessHierarchyElement(result, notebookElement.Content.Root);

            return result;
        }

        public SectionInfo GetSectionPages(ref Application oneNoteApp, string notebookId, string sectionGroupId, string sectionId, Func<PageInfo, bool> filter)
        {
            var sectionElement = ApplicationCache.Instance.GetHierarchy(ref oneNoteApp, sectionId, HierarchyScope.hsPages);

            if (sectionElement == null)
                throw new Exception(string.Format("{0}: '{1}'", BibleCommon.Resources.Constants.SectionNotFound, sectionId));

            int pagesCount = 0;
            return ProcessSection(sectionElement.Content.Root, sectionGroupId, notebookId, sectionElement.Xnm, filter, ref pagesCount);
        }

        private SectionGroupInfo ProcessSectionGroup(XElement sectionGroupElement, string notebookId, XmlNamespaceManager xnm, Func<PageInfo, bool> filter, ref int pagesCount)
        {
            SectionGroupInfo sectionGroup = new SectionGroupInfo();
            ProcessHierarchyElement(sectionGroup, sectionGroupElement);

            foreach (var subSectionGroupElement in sectionGroupElement.XPathSelectElements("one:SectionGroup", xnm)
                .Where(sg => !OneNoteUtils.IsRecycleBin(sg)))
            {
                int oldPagesCount = pagesCount;
                var subSectionGroup = ProcessSectionGroup(subSectionGroupElement, notebookId, xnm, filter, ref pagesCount);
                if (pagesCount > oldPagesCount)
                    sectionGroup.SectionGroups.Add(subSectionGroup);
            }

            foreach (var subSection in sectionGroupElement.XPathSelectElements("one:Section", xnm))
            {
                var section = ProcessSection(subSection, sectionGroup.Id, notebookId, xnm, filter, ref pagesCount);
                if (section.Pages.Count > 0)
                    sectionGroup.Sections.Add(section);
            }

            return sectionGroup;
        }

        private SectionInfo ProcessSection(XElement sectionElement, string sectionGroupId,
           string notebookId, XmlNamespaceManager xnm, Func<PageInfo, bool> filter, ref int pagesCount)
        {
            SectionInfo section = new SectionInfo();
            ProcessHierarchyElement(section, sectionElement);

            foreach (var pageElement in sectionElement.XPathSelectElements("one:Page", xnm))
            {
                if (!OneNoteUtils.IsRecycleBin(pageElement))
                {
                    var page = new PageInfo()
                    {
                        NotebookId = notebookId,
                        SectionGroupId = sectionGroupId,
                        SectionId = section.Id,
                        PageElement = pageElement,
                        Xnm = xnm
                    };
                    ProcessHierarchyElement(page, pageElement);

                    if (filter == null || filter(page))
                    {
                        section.Pages.Add(page);
                        pagesCount++;
                    }
                }
            }

            return section;
        }

        public void ProcessHierarchyElement(HierarchyElementInfo hierarchyElement, XElement xElement)
        {
            var nickNameAttr = xElement.Attribute("nickname");
            if (nickNameAttr != null)
                hierarchyElement.Title = nickNameAttr.Value;
            else
                hierarchyElement.Title = (string)xElement.Attribute("name");

            hierarchyElement.Id = (string)xElement.Attribute("ID");
        }
    }
}
