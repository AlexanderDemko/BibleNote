using System;
using System.Collections.Generic;
using System.Linq;
using NJsonSchema.Generation;

namespace BibleNote.Application.Utils
{
    public class NSwagSchemaNameGenerator : DefaultSchemaNameGenerator, ISchemaNameGenerator
    {
        readonly IList<string> excludeNames = new List<string>() {
            "BibleNote.Domain.Entities",
            "BibleNote.Infrastructure",
        };
        public override string Generate(Type type)
        {
            var typeName = base.Generate(type);
            var fullName = type.FullName;

            if (!excludeNames.Any(n => fullName.StartsWith(n)))
            {
                var newFullName = type.FullName
                    .Replace("BibleNote.Middleware", "")
                    .Replace("SharedViewModels", "")
                    .Replace(".", "")
                    ;
                typeName = typeName.Replace(type.Name, newFullName);
            }

            return typeName;
        }
    }
}
