﻿using BibleNote.Providers.OneNote.Services.Models;
using Microsoft.Office.Interop.OneNote;
using System;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace BibleNote.Providers.OneNote.Contracts
{
    public interface IOneNoteAppWrapper : IDisposable
    {
        Task<string> GetPageContentAsync(string pageId, PageInfo pageInfo = PageInfo.piBasic);
        Task<string> GetHierarchyContentAsync(string hierarchyId, HierarchyScope scope);
        Task<string> GetCurrentPageIdAsync();
        Task<string> GetCurrentSectionIdAsync();
        Task UpdatePageContentAsync(XDocument pageDoc);
        Task<OneNoteHierarchyInfo> GetHierarchyInfoAsync(string hierarchyId);
        Task SelectHierarchyItems(string title, string description, string buttonText, IQuickFilingDialogCallback callback);
    }
}