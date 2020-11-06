using System.Collections.Generic;
using System.Threading.Tasks;
using BibleNote.Middleware.NavigationProviders.SharedViewModels;
using Microsoft.AspNetCore.Mvc;

namespace BibleNote.Application.Controllers
{
    public class NavigationProvidersController : BaseController
    {
        [HttpGet]
        public Task<List<NavigationProviderVm>> GetAllAsync()
        {
            return Mediator.Send(new Middleware.NavigationProviders.Queries.List.Request());
        }


        [HttpDelete]
        public Task DeleteAsync(int id)
        {
            return Mediator.Send(new Middleware.NavigationProviders.Commands.Delete.Request(id));
        }

        #region OneNote

        [HttpGet]
        public Task<OneNoteNavigationProviderVm> GetOneNoteProviderInfoAsync(int id)
        {
            return Mediator.Send(new Middleware.NavigationProviders.Queries.OneNote.Read.Request(id));
        }

        [HttpPost]
        public Task<int> CreateOneNoteProviderAsync(OneNoteNavigationProviderVm provider)
        {
            return Mediator.Send(new Middleware.NavigationProviders.Commands.OneNote.Create.Request(provider));
        }

        [HttpPut]
        public Task UpdateOneNoteProviderAsync(OneNoteNavigationProviderVm provider)
        {
            return Mediator.Send(new Middleware.NavigationProviders.Commands.OneNote.Update.Request(provider));
        }

        [HttpGet]
        public Task CallOneNoteSelectHierarchyItemDialog(string title, string description, string buttonText, string callbackFunction)
        {
            return Mediator.Send(
                new Middleware.NavigationProviders.Queries.OneNote.SelectHierarchy.Request(title, description, buttonText, callbackFunction));
        }

        [HttpGet]
        public Task<HierarchyItemVm> GetOneNoteHierarchyItemInfo(string hierarchyId)
        {
            return Mediator.Send(new Middleware.NavigationProviders.Queries.OneNote.GetHierarchyInfo.Request(hierarchyId));
        }

        #endregion
    }
}
