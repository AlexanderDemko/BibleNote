using System;
using System.Linq;
using Microsoft.Office.Interop.OneNote;
using System.Xml;
using System.Xml.Linq;
using System.Xml.XPath;
using BibleNote.Providers.OneNote.Contracts;
using System.Threading.Tasks;
using BibleNote.Providers.OneNote.Services.NavigationProvider.Models;
using System.Collections.Generic;
using BibleNote.Providers.OneNote.Utils;

namespace BibleNote.Providers.OneNote.Services.NavigationProvider
{
    public class NotebookIterator: INotebookIterator
    {
        #region Helper classes

        public abstract class HierarchyElementInfo
        {
            public string Id { get; set; }

            public string Name { get; set; }                       
        }

        public class ContainerInfo : HierarchyElementInfo
        {
            public List<ContainerInfo> ChildrenContainers { get; set; }

            public List<PageInfo> Pages { get; set; }
        }

        public class PageInfo : HierarchyElementInfo
        {
            public DateTime LastModifiedTime { get; set; }
        }

        #endregion

        private readonly IOneNoteAppWrapper oneNoteApp;
        private readonly XmlNamespaceManager xnm;

        public NotebookIterator(IOneNoteAppWrapper oneNoteApp)
        {
            this.oneNoteApp = oneNoteApp;
            this.xnm = OneNoteUtils.GetOneNoteXNM();
        }

        public async Task<ContainerInfo> GetHierarchyPagesAsync(string hierarchyId, OneNoteHierarchyType hierarchyType)
        {
            var hierarchyContent = await this.oneNoteApp.GetHierarchyContentAsync(hierarchyId, HierarchyScope.hsPages);
            var hierarchyDoc = XDocument.Parse(hierarchyContent);            

            return ProcessHierarchyElement(hierarchyDoc.Root, hierarchyType);
        }

        private ContainerInfo ProcessHierarchyElement(XElement hierarchyEl, OneNoteHierarchyType hierarchyType)
        {
            switch (hierarchyType)
            {
                case OneNoteHierarchyType.Notebook:
                case OneNoteHierarchyType.SectionGroup:
                    return ProcessSectionGroup(hierarchyEl);
                case OneNoteHierarchyType.Section:
                    return ProcessSection(hierarchyEl);
                default:
                    throw new NotSupportedException(hierarchyType.ToString());
            }
        } 

        private ContainerInfo ProcessSectionGroup(XElement sectionGroupEl)
        {
            var sectionGroup = new ContainerInfo();
            ProcessHierarchyElement(sectionGroup, sectionGroupEl);

            foreach (var subSectionGroupEl in sectionGroupEl.XPathSelectElements("one:SectionGroup", xnm)
                .Where(sg => !OneNoteUtils.IsRecycleBin(sg)))
            {
                var subSectionGroup = ProcessSectionGroup(subSectionGroupEl);
                sectionGroup.ChildrenContainers.Add(subSectionGroup);
            }

            foreach (var subSection in sectionGroupEl.XPathSelectElements("one:Section", xnm))
            {
                var section = ProcessSection(subSection);
                sectionGroup.ChildrenContainers.Add(section);
            }

            return sectionGroup;
        }

        private ContainerInfo ProcessSection(XElement sectionEl)
        {
            var section = new ContainerInfo();
            ProcessHierarchyElement(section, sectionEl);

            foreach (var pageEl in sectionEl.XPathSelectElements("one:Page", xnm))
            {
                if (!OneNoteUtils.IsRecycleBin(pageEl))
                {
                    var page = new PageInfo()
                    {
                        LastModifiedTime = StringUtils.ParseDateTime((string)pageEl.Attribute("lastModifiedTime"))
                    };

                    ProcessHierarchyElement(page, pageEl);
                    section.Pages.Add(page);
                }
            }

            return section;
        }

        public void ProcessHierarchyElement(HierarchyElementInfo hierarchyInfo, XElement xElement)
        {
            var nickNameAttr = xElement.Attribute("nickname");
            if (nickNameAttr != null)
                hierarchyInfo.Name = nickNameAttr.Value;
            else
                hierarchyInfo.Name = (string)xElement.Attribute("name");

            hierarchyInfo.Id = (string)xElement.Attribute("ID");
        }
    }
}
