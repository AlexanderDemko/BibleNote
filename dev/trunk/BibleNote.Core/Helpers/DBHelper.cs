using BibleNote.Core.Contracts;
using BibleNote.Core.DBModel;
using BibleNote.Core.Services;
using BibleNote.Core.Services.System;
using System;
using System.Collections.Generic;
using System.Data.EntityClient;
using System.Data.SqlClient;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Helpers
{
    public class DBHelper
    {
        public static IndexModel GetIndexModel()
        {
            var entityStringBuilder = new EntityConnectionStringBuilder();
            entityStringBuilder.ProviderConnectionString = string.Format("Data Source={0}", DIContainer.Resolve<IConfigurationManager>().DBIndexPath);
            entityStringBuilder.Provider = "System.Data.SqlServerCe.4.0";
            entityStringBuilder.Metadata = "res://*/DBModel.IndexModel.csdl|res://*/DBModel.IndexModel.ssdl|res://*/DBModel.IndexModel.msl";

            return new IndexModel(entityStringBuilder.ConnectionString);
        }


        public static ContentModel GetContentModel()
        {
            var entityStringBuilder = new EntityConnectionStringBuilder();
            entityStringBuilder.ProviderConnectionString = string.Format("Data Source=", DIContainer.Resolve<IConfigurationManager>().DBContentPath);
            entityStringBuilder.Provider = "System.Data.SqlServerCe.4.0";
            entityStringBuilder.Metadata = "res://*/DBModel.ContentModel.csdl|res://*/DBModel.ContentModel.ssdl|res://*/DBModel.ContentModel.msl";

            return new ContentModel(entityStringBuilder.ConnectionString);
        }
    }
}
